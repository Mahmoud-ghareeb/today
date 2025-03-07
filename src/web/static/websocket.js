let isRecording = false;
let websocket = null;
let recorder = null;
let chunkDuration = 1000;
let websocketUrl = "ws://localhost:8005/asr";
let userClosing = false;

const statusText = document.getElementById("status");
const recordButton = document.getElementById("recordButton");
const chunkSelector = document.getElementById("chunkSelector");
const websocketInput = document.getElementById("websocketInput");
const linesTranscriptDiv = document.getElementById("linesTranscript");


const date = new Date();
const formattedDate = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
});

function getFormattedDate() {
    let now = new Date();
    let day = String(now.getDate()).padStart(2, '0');
    let month = String(now.getMonth() + 1).padStart(2, '0');
    let year = now.getFullYear();

    return `${day}_${month}_${year}`;
}

document.getElementById("curr-date").innerHTML = "Diary - " + formattedDate


chunkSelector.addEventListener("change", () => {
    chunkDuration = parseInt(chunkSelector.value);
});

function pull_current_diary(){
    let date = getFormattedDate()

    fetch('/get?timestamp=' + date, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        hugerte.get('editorjs').setContent(data.data)
    })
    .catch(error => {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'An error occurred while getting the data.',
            toast: true,
            position: 'bottom-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
        });
    });
}


hugerte.init({
    selector: '#editorjs',
    height: "80vh",
    width: "50vw",
    menubar: false,
    plugins: 'lists link image table code help',
    toolbar: 'undo redo | formatselect | bold italic | alignleft aligncenter alignright | bullist numlist | link image | savebutton',
    setup: function (editor) {
        editor.ui.registry.addButton('savebutton', {
            text: 'Save',
            icon: 'save',
            onAction: function () {
                const content = editor.getContent();

                fetch('/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content: content }),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Saved!',
                            text: 'Your diary has been saved successfully.',
                            toast: true,
                            position: 'bottom-end',
                            showConfirmButton: false,
                            timer: 3000,
                            timerProgressBar: true,
                        });
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'Failed to save the diary.',
                            toast: true,
                            position: 'bottom-end',
                            showConfirmButton: false,
                            timer: 3000,
                            timerProgressBar: true,
                        });
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'An error occurred while saving the file.',
                        toast: true,
                        position: 'bottom-end',
                        showConfirmButton: false,
                        timer: 3000,
                        timerProgressBar: true,
                    });
                });
            }
        });

        editor.on('init', function () {
            pull_current_diary();
        });
    }
});

websocketInput.addEventListener("change", () => {
    const urlValue = websocketInput.value.trim();
    if (!urlValue.startsWith("ws://") && !urlValue.startsWith("wss://")) {
        statusText.textContent = "Invalid WebSocket URL (must start with ws:// or wss://)";
        return;
    }
    websocketUrl = urlValue;
    statusText.textContent = "WebSocket URL updated. Ready to connect.";
});

function setupWebSocket() {
    return new Promise((resolve, reject) => {
        try {
            websocket = new WebSocket(websocketUrl);
        } catch (error) {
            statusText.textContent = "Invalid WebSocket URL. Please change it in the index.html page CUZ its hidden :).";
            reject(error);
            return;
        }

        websocket.onopen = () => {
            statusText.textContent = "Connected to server.";
            resolve();
        };

        websocket.onclose = () => {
            if (userClosing) {
                statusText.textContent = "WebSocket closed.";
            } else {
                statusText.textContent =
                    "Disconnected from the WebSocket server. (click on speech to start.)";
            }
            userClosing = false;
        };

        websocket.onerror = () => {
            statusText.textContent = "Error connecting to WebSocket.";
            reject(new Error("Error connecting to WebSocket"));
        };

        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            const { 
                lines = [], 
                buffer_transcription = "", 
                buffer_diarization = "",
                remaining_time_transcription = 0,
                remaining_time_diarization = 0
            } = data;
            
            renderLinesWithBuffer(
                lines, 
                buffer_diarization, 
                buffer_transcription, 
                remaining_time_diarization,
                remaining_time_transcription
            );
        };
    });
}

function getTextFromBlocks(blocks) {
    let textContent = "";

    blocks.forEach(block => {
        if (block.type === "paragraph" || block.type === "header") {
            textContent += block.data.text + "\n";
        }
    });

    return textContent.trim();
}

// Fetch and display text
async function fetchAndDisplayText() {
    try {
        const existingBlocks = await editor.save();
        const textContent = getTextFromBlocks(existingBlocks.blocks);
        
        return textContent

    } catch (error) {
        console.error("Error fetching blocks:", error);
    }
}

async function renderLinesWithBuffer(lines, buffer_diarization, buffer_transcription, remaining_time_diarization, remaining_time_transcription) {
    
    // let textContent = await fetchAndDisplayText()
    let textContent = hugerte.get('editorjs').getContent();
    console.log(lines[0].text)
    let newText = `${lines[0].text}`
    
    if (buffer_transcription) {
        newText += `<span color="red"> ${buffer_transcription} </span>`;
    }
    console.log(buffer_transcription)
    const closingTagIndex = textContent.lastIndexOf('</p>');
    if (closingTagIndex !== -1) {
        textContent = textContent.slice(0, closingTagIndex) + newText + textContent.slice(closingTagIndex);
    }

    hugerte.get('editorjs').setContent("")
    hugerte.get('editorjs').setContent(textContent.trim());
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        recorder.ondataavailable = (e) => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(e.data);
            }
        };
        recorder.start(chunkDuration);
        isRecording = true;
        updateUI();
    } catch (err) {
        statusText.textContent = "Error accessing microphone. Please allow microphone access.";
    }
}

function stopRecording() {
    userClosing = true;
    if (recorder) {
        recorder.stop();
        recorder = null;
    }
    isRecording = false;

    if (websocket) {
        websocket.close();
        websocket = null;
    }

    updateUI();	
}

async function toggleRecording() {
    if (!isRecording) {
        linesTranscriptDiv.innerHTML = "";
        try {
            await setupWebSocket();
            await startRecording();
        } catch (err) {
            statusText.textContent = "Could not connect to WebSocket or access mic. Aborted.";
        }
    } else {
        stopRecording();
    }
}

function updateUI() {
    recordButton.classList.toggle("recording", isRecording);
    statusText.textContent = isRecording ? "Recording..." : "Click to start transcription";
}

recordButton.addEventListener("click", toggleRecording);