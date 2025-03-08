import asyncio
import ffmpeg

import math
import logging
from datetime import timedelta
import traceback

def format_time(seconds):
    return str(timedelta(seconds=int(seconds)))

async def start_ffmpeg_decoder(CHANNELS, SAMPLE_RATE):
    """
    Start an FFmpeg process in async streaming mode that reads WebM from stdin
    and outputs raw s16le PCM on stdout. Returns the process object.
    """
    process = (
        ffmpeg.input("pipe:0", format="webm")
        .output(
            "pipe:1",
            format="s16le",
            acodec="pcm_s16le",
            ac=CHANNELS,
            ar=str(SAMPLE_RATE),
        )
        .run_async(pipe_stdin=True, pipe_stdout=True, pipe_stderr=True)
    )
    return process

async def transcription_processor(shared_state, pcm_queue, online, logger):
    full_transcription = ""
    sep = online.asr.sep
    
    while True:
        try:
            pcm_array = await pcm_queue.get()
            
            logger.info(f"{len(online.audio_buffer) / online.SAMPLING_RATE} seconds of audio will be processed by the model.")
            
            # Process transcription
            online.insert_audio_chunk(pcm_array)
            new_tokens = online.process_iter()
            
            if new_tokens:
                full_transcription += sep.join([t.text for t in new_tokens])
                
            _buffer = online.get_buffer()
            buffer = _buffer.text
            end_buffer = _buffer.end if _buffer.end else (new_tokens[-1].end if new_tokens else 0)
            
            if buffer in full_transcription:
                buffer = ""
                
            await shared_state.update_transcription(
                new_tokens, buffer, end_buffer, full_transcription, sep)
            
        except Exception as e:
            logger.warning(f"Exception in transcription_processor: {e}")
            logger.warning(f"Traceback: {traceback.format_exc()}")
        finally:
            pcm_queue.task_done()

async def diarization_processor(shared_state, pcm_queue, diarization_obj, logger):
    buffer_diarization = ""
    
    while True:
        try:
            pcm_array = await pcm_queue.get()
            
            # Process diarization
            await diarization_obj.diarize(pcm_array)
            
            # Get current state
            state = await shared_state.get_current_state()
            tokens = state["tokens"]
            end_attributed_speaker = state["end_attributed_speaker"]
            
            # Update speaker information
            new_end_attributed_speaker = diarization_obj.assign_speakers_to_tokens(
                end_attributed_speaker, tokens)
            
            await shared_state.update_diarization(new_end_attributed_speaker, buffer_diarization)
            
        except Exception as e:
            logger.warning(f"Exception in diarization_processor: {e}")
            logger.warning(f"Traceback: {traceback.format_exc()}")
        finally:
            pcm_queue.task_done()

async def results_formatter(shared_state, websocket, config, logger):
    while True:
        try:
            # Get the current state
            state = await shared_state.get_current_state()
            tokens = state["tokens"]
            buffer_transcription = state["buffer_transcription"]
            buffer_diarization = state["buffer_diarization"]
            end_attributed_speaker = state["end_attributed_speaker"]
            remaining_time_transcription = state["remaining_time_transcription"]
            remaining_time_diarization = state["remaining_time_diarization"]
            sep = state["sep"]
            
            # If diarization is enabled but no transcription, add dummy tokens periodically
            if not tokens and not config["app"]["transcription"] and config["app"]["diarization"]:
                await shared_state.add_dummy_token()
                # Re-fetch tokens after adding dummy
                state = await shared_state.get_current_state()
                tokens = state["tokens"]
            
            # Process tokens to create response
            previous_speaker = -10
            lines = []
            last_end_diarized = 0
            undiarized_text = []
            
            for token in tokens:
                speaker = token.speaker
                if config["app"]["diarization"]:
                    if (speaker == -1 or speaker == 0) and token.end >= end_attributed_speaker:
                        undiarized_text.append(token.text)
                        continue
                    elif (speaker == -1 or speaker == 0) and token.end < end_attributed_speaker:
                        speaker = previous_speaker
                    if speaker not in [-1, 0]:
                        last_end_diarized = max(token.end, last_end_diarized)

                if speaker != previous_speaker or not lines:
                    lines.append(
                        {
                            "speaker": speaker,
                            "text": token.text,
                            "beg": format_time(token.start),
                            "end": format_time(token.end),
                            "diff": round(token.end - last_end_diarized, 2)
                        }
                    )
                    previous_speaker = speaker
                elif token.text:  # Only append if text isn't empty
                    lines[-1]["text"] += sep + token.text
                    lines[-1]["end"] = format_time(token.end)
                    lines[-1]["diff"] = round(token.end - last_end_diarized, 2)
            
            if undiarized_text:
                combined_buffer_diarization = sep.join(undiarized_text)
                if buffer_transcription:
                    combined_buffer_diarization += sep
                await shared_state.update_diarization(end_attributed_speaker, combined_buffer_diarization)
                buffer_diarization = combined_buffer_diarization
                
            if lines:
                response = {
                    "lines": lines, 
                    "buffer_transcription": buffer_transcription,
                    "buffer_diarization": buffer_diarization,
                    "remaining_time_transcription": remaining_time_transcription,
                    "remaining_time_diarization": remaining_time_diarization
                }
            else:
                response = {
                    "lines": [{
                        "speaker": 1,
                        "text": "",
                        "beg": format_time(0),
                        "end": format_time(tokens[-1].end) if tokens else format_time(0),
                        "diff": 0
                }],
                    "buffer_transcription": buffer_transcription,
                    "buffer_diarization": buffer_diarization,
                    "remaining_time_transcription": remaining_time_transcription,
                    "remaining_time_diarization": remaining_time_diarization

                }
            
            response_content = ' '.join([str(line['speaker']) + ' ' + line["text"] for line in lines]) + ' | ' + buffer_transcription + ' | ' + buffer_diarization
            
            if response_content != shared_state.last_response_content:
                if lines or buffer_transcription or buffer_diarization:
                    await websocket.send_json(response)
                    shared_state.last_response_content = response_content
            
            # Add a small delay to avoid overwhelming the client
            await asyncio.sleep(0.1)
            
        except Exception as e:
            logger.warning(f"Exception in results_formatter: {e}")
            logger.warning(f"Traceback: {traceback.format_exc()}")
            await asyncio.sleep(0.5)  # Back off on error
