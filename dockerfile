FROM pytorch/pytorch:2.6.0-cuda11.8-cudnn9-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    portaudio19-dev \
    python3-pyaudio \
    python3-dev \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY . .    

RUN pip install --upgrade pip

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8005

CMD python main.py
