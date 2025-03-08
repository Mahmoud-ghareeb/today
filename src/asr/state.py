
import asyncio
from time import time

from .timed_objects import ASRToken

class SharedState:
    def __init__(self):
        self.tokens = []
        self.buffer_transcription = ""
        self.buffer_diarization = ""
        self.full_transcription = ""
        self.end_buffer = 0
        self.end_attributed_speaker = 0
        self.lock = asyncio.Lock()
        self.beg_loop = time()
        self.sep = " "  # Default separator
        self.last_response_content = ""  # To track changes in response
        
    async def update_transcription(self, new_tokens, buffer, end_buffer, full_transcription, sep):
        async with self.lock:
            self.tokens = new_tokens
            self.buffer_transcription = buffer
            self.end_buffer = end_buffer
            self.full_transcription = full_transcription
            self.sep = sep
            
    async def update_diarization(self, end_attributed_speaker, buffer_diarization=""):
        async with self.lock:
            self.end_attributed_speaker = end_attributed_speaker
            if buffer_diarization:
                self.buffer_diarization = buffer_diarization
            
    async def add_dummy_token(self):
        async with self.lock:
            current_time = time() - self.beg_loop
            dummy_token = ASRToken(
                start=current_time,
                end=current_time + 0.5,
                text="",
                speaker=-1
            )
            self.tokens.append(dummy_token)
            
    async def get_current_state(self):
        async with self.lock:
            current_time = time()
            remaining_time_transcription = 0
            remaining_time_diarization = 0
            
            # Calculate remaining time for transcription buffer
            if self.end_buffer > 0:
                remaining_time_transcription = max(0, round(current_time - self.beg_loop - self.end_buffer, 2))
                
            # Calculate remaining time for diarization
            if self.end_attributed_speaker > 0:
                remaining_time_diarization = max(0, round(max(self.end_buffer, self.tokens[-1].end if self.tokens else 0) - self.end_attributed_speaker, 2))
                
            return {
                "tokens": self.tokens.copy(),
                "buffer_transcription": self.buffer_transcription,
                "buffer_diarization": self.buffer_diarization,
                "end_buffer": self.end_buffer,
                "end_attributed_speaker": self.end_attributed_speaker,
                "sep": self.sep,
                "remaining_time_transcription": remaining_time_transcription,
                "remaining_time_diarization": remaining_time_diarization
            }
            
    async def reset(self):
        """Reset the state."""
        async with self.lock:
            self.tokens = []
            self.buffer_transcription = ""
            self.buffer_diarization = ""
            self.end_buffer = 0
            self.end_attributed_speaker = 0
            self.full_transcription = ""
            self.beg_loop = time()
            self.last_response_content = ""
