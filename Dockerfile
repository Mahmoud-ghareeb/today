FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app


RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3.10-dev \
    curl \
    ffmpeg \
    ca-certificates \
    gnupg2 \
    libsndfile1 \
    portaudio19-dev \
    python3-dev \
    build-essential \
    gcc \
    wget \
    pulseaudio \
    pulseaudio-utils \
    && rm -rf /var/lib/apt/lists/*


RUN ln -s /usr/bin/python3.10 /usr/bin/python


# RUN useradd -m -s /bin/bash appuser


# RUN mkdir -p /app/diaries && \
#     chown -R appuser:appuser /app

COPY . .    

RUN pip install --upgrade pip


RUN pip install --no-cache-dir PyAudio==0.2.14


RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8008

# USER appuser

CMD python main.py 