import sys
import logging
import io
import soundfile as sf
import math
import torch
from typing import List
import numpy as np
from .timed_objects import ASRToken

logger = logging.getLogger(__name__)

class ASRBase:
    sep = " "  # join transcribe words with this character (" " for whisper_timestamped,
              # "" for faster-whisper because it emits the spaces when needed)

    def __init__(self, lan, modelsize=None, cache_dir=None, model_dir=None, logfile=sys.stderr):
        self.logfile = logfile
        self.transcribe_kargs = {}
        if lan == "auto":
            self.original_language = None
        else:
            self.original_language = lan
        self.model = self.load_model(modelsize, cache_dir, model_dir)

    def with_offset(self, offset: float) -> ASRToken:
        # This method is kept for compatibility (typically you will use ASRToken.with_offset)
        return ASRToken(self.start + offset, self.end + offset, self.text)

    def __repr__(self):
        return f"ASRToken(start={self.start:.2f}, end={self.end:.2f}, text={self.text!r})"

    def load_model(self, modelsize, cache_dir, model_dir):
        raise NotImplementedError("must be implemented in the child class")

    def transcribe(self, audio, init_prompt=""):
        raise NotImplementedError("must be implemented in the child class")

    def use_vad(self):
        raise NotImplementedError("must be implemented in the child class")

class FasterWhisperASR(ASRBase):
    """Uses faster-whisper as the backend."""
    sep = ""

    def load_model(self, modelsize=None, cache_dir=None, model_dir=None):
        from faster_whisper import WhisperModel

        if model_dir is not None:
            logger.debug(f"Loading whisper model from model_dir {model_dir}. "
                         f"modelsize and cache_dir parameters are not used.")
            model_size_or_path = model_dir
        elif modelsize is not None:
            model_size_or_path = modelsize
        else:
            raise ValueError("Either modelsize or model_dir must be set")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "float32"

        model = WhisperModel(
            model_size_or_path,
            device=device,
            compute_type=compute_type,
            download_root=cache_dir,
        )
        return model

    def transcribe(self, audio: np.ndarray, init_prompt: str = "") -> list:
        segments, info = self.model.transcribe(
            audio,
            language=self.original_language,
            initial_prompt=init_prompt,
            beam_size=5,
            word_timestamps=True,
            condition_on_previous_text=True,
            **self.transcribe_kargs,
        )
        return list(segments)

    def ts_words(self, segments) -> List[ASRToken]:
        tokens = []
        for segment in segments:
            if segment.no_speech_prob > 0.9:
                continue
            for word in segment.words:
                token = ASRToken(word.start, word.end, word.word)
                tokens.append(token)
        return tokens

    def segments_end_ts(self, segments) -> List[float]:
        return [segment.end for segment in segments]

    def use_vad(self):
        self.transcribe_kargs["vad_filter"] = True

    def set_translate_task(self):
        self.transcribe_kargs["task"] = "translate"
