import io
import argparse
import asyncio
import numpy as np
import ffmpeg
from time import time
from contextlib import asynccontextmanager
from pydantic import BaseModel
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.whisper.whisper_online import backend_factory, online_factory, add_shared_args
from src.whisper.utils import *
from src.whisper.state import SharedState

from src.llm.llm import *

import math
import logging
import yaml
import traceback
import os


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logging.getLogger().setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


config = yaml.safe_load(open("configs/config.yml"))
parser = argparse.ArgumentParser(description="Whisper FastAPI Online Server")
add_shared_args(parser)
args = parser.parse_args()

SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLES_PER_SEC = SAMPLE_RATE * int(args.min_chunk_size)
BYTES_PER_SAMPLE = 2
BYTES_PER_SEC = SAMPLES_PER_SEC * BYTES_PER_SAMPLE
MAX_BYTES_PER_SEC = 32000 * 5 

@asynccontextmanager
async def lifespan(app: FastAPI):
    global asr, tokenizer, diarization, llm

    if config["app"]["transcription"]:
        asr, tokenizer = backend_factory(args)
    else:
        asr, tokenizer = None, None

    diarization = None
    
    llm = get_llm()
    
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="src/web/static"), name="static")

with open("src/web/index.html", "r", encoding="utf-8") as f:
    html = f.read()


@app.get("/")
async def get():
    return HTMLResponse(html)

@app.websocket("/asr")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection opened.")

    ffmpeg_process = None
    pcm_buffer = bytearray()
    shared_state = SharedState()
    
    transcription_queue = asyncio.Queue() if config["app"]["transcription"] else None
    diarization_queue = asyncio.Queue() if config["app"]["diarization"] else None
    
    online = None

    async def restart_ffmpeg():
        nonlocal ffmpeg_process, online, pcm_buffer
        if ffmpeg_process:
            try:
                ffmpeg_process.kill()
                await asyncio.get_event_loop().run_in_executor(None, ffmpeg_process.wait)
            except Exception as e:
                logger.warning(f"Error killing FFmpeg process: {e}")
        ffmpeg_process = await start_ffmpeg_decoder(CHANNELS, SAMPLE_RATE)
        pcm_buffer = bytearray()
        
        if config["app"]["transcription"]:
            online = online_factory(args, asr, tokenizer)
        
        await shared_state.reset()
        logger.info("FFmpeg process started.")

    await restart_ffmpeg()

    tasks = []    
    if config["app"]["transcription"] and online:
        tasks.append(asyncio.create_task(
            transcription_processor(shared_state, transcription_queue, online, logger)))    
    if config["app"]["diarization"] and diarization:
        tasks.append(asyncio.create_task(
            diarization_processor(shared_state, diarization_queue, diarization, logger)))
    formatter_task = asyncio.create_task(results_formatter(shared_state, websocket, config, logger))
    tasks.append(formatter_task)

    async def ffmpeg_stdout_reader():
        nonlocal ffmpeg_process, pcm_buffer
        loop = asyncio.get_event_loop()
        beg = time()
        
        while True:
            try:
                elapsed_time = math.floor((time() - beg) * 10) / 10 # Round to 0.1 sec
                ffmpeg_buffer_from_duration = max(int(32000 * elapsed_time), 4096)
                beg = time()

                # Read chunk with timeout
                try:
                    chunk = await asyncio.wait_for(
                        loop.run_in_executor(
                            None, ffmpeg_process.stdout.read, ffmpeg_buffer_from_duration
                        ),
                        timeout=5.0
                    )
                except asyncio.TimeoutError:
                    logger.warning("FFmpeg read timeout. Restarting...")
                    await restart_ffmpeg()
                    beg = time()
                    continue  # Skip processing and read from new process

                if not chunk:
                    logger.info("FFmpeg stdout closed.")
                    break
                pcm_buffer.extend(chunk)
                if len(pcm_buffer) >= BYTES_PER_SEC:
                    if len(pcm_buffer) > MAX_BYTES_PER_SEC:
                        logger.warning(
                            f"""Audio buffer is too large: {len(pcm_buffer) / BYTES_PER_SEC:.2f} seconds.
                            The model probably struggles to keep up. Consider using a smaller model.
                            """)
                        
                    pcm_array = (
                        np.frombuffer(pcm_buffer[:MAX_BYTES_PER_SEC], dtype=np.int16).astype(np.float32)
                        / 32768.0
                    )
                    pcm_buffer = pcm_buffer[MAX_BYTES_PER_SEC:]
                    
                    if config["app"]["transcription"] and transcription_queue:
                        await transcription_queue.put(pcm_array.copy())
                    
                    if config["app"]["diarization"] and diarization_queue:
                        await diarization_queue.put(pcm_array.copy())
                    
                    if not config["app"]["transcription"] and not config["app"]["diarization"]:
                        await asyncio.sleep(0.1)
                    
            except Exception as e:
                logger.warning(f"Exception in ffmpeg_stdout_reader: {e}")
                logger.warning(f"Traceback: {traceback.format_exc()}")
                break

        logger.info("Exiting ffmpeg_stdout_reader...")

    stdout_reader_task = asyncio.create_task(ffmpeg_stdout_reader())
    tasks.append(stdout_reader_task)    
    try:
        while True:
            
            message = await websocket.receive_bytes()
            try:
                ffmpeg_process.stdin.write(message)
                ffmpeg_process.stdin.flush()
            except (BrokenPipeError, AttributeError) as e:
                logger.warning(f"Error writing to FFmpeg: {e}. Restarting...")
                await restart_ffmpeg()
                ffmpeg_process.stdin.write(message)
                ffmpeg_process.stdin.flush()
    except WebSocketDisconnect:
        logger.warning("WebSocket disconnected.")
    finally:
        for task in tasks:
            task.cancel()
            
        try:
            await asyncio.gather(*tasks, return_exceptions=True)
            ffmpeg_process.stdin.close()
            ffmpeg_process.wait()
        except Exception as e:
            logger.warning(f"Error during cleanup: {e}")
        
        if config["app"]["diarization"] and diarization:
            diarization.close()
        
        logger.info("WebSocket endpoint cleaned up.")

class SaveRequest(BaseModel):
    content: str

os.makedirs("diaries", exist_ok=True)

@app.post("/save")
async def save_content(request: SaveRequest):
    try:
        timestamp = datetime.now().strftime("%d_%m_%Y")
        filename = f"diaries/diary_{timestamp}.txt"

        with open(filename, "w", encoding="utf-8") as file:
            file.write(request.content)

        return {"success": True, "message": "File saved successfully!", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save the file: {str(e)}")
    
@app.get("/get")
async def get_content(timestamp):
    try:
        if not timestamp:
            timestamp = datetime.now().strftime("%d_%m_%Y")

        filename = f"diaries/diary_{timestamp}.txt"
        if os.path.exists(filename):
            with open(filename, "r", encoding="utf-8") as file:
                data = file.read()

            return {"success": True, "data": data}
        
        return {"success": True, "data": ""}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save the file: {str(e)}")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app", host=config["app"]["host"], port=config["app"]["port"],
        log_level="info"
    )