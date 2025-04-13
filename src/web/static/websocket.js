let isRecording = false;
let websocket = null;
let recorder = null;
let chunkDuration = 1000;
let websocketUrl = "ws://localhost:8008/asr";
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

function getFormattedDate(isDate="") {
    let now;
    if (isDate)
    {
        now = new Date(isDate);
    } else {
        now = new Date();
    }
        
    let day = String(now.getDate()).padStart(2, '0');
    let month = String(now.getMonth() + 1).padStart(2, '0');
    let year = now.getFullYear();

    return `${year}_${month}_${day}`;
}

document.getElementById("curr-date").innerHTML = "Diary - " + formattedDate;
document.getElementById("normal-date").innerHTML = getFormattedDate();

chunkSelector.addEventListener("change", () => {
    chunkDuration = parseInt(chunkSelector.value);
});

function pull_current_diary(){
    let date = getFormattedDate()
    console.log("here")
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
        console.log(data)
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

function initHeaderCalendar() {
    const calendarBtn = document.getElementById('headerCalendarBtn');
    
    
    if (!calendarBtn) {
        
        const titleContainer = document.querySelector('.title-container');
        if (!titleContainer) {
            console.error("Title container not found");
            return;
        }
        
        
        const newCalendarBtn = document.createElement('button');
        newCalendarBtn.setAttribute('id', 'headerCalendarBtn');
        newCalendarBtn.setAttribute('class', 'calendar-icon-btn');
        newCalendarBtn.innerHTML = '<span class="calendar-icon">📅</span>';
        
        
        const titleElement = titleContainer.querySelector('h1');
        if (titleElement) {
            titleElement.insertAdjacentElement('afterend', newCalendarBtn);
        } else {
            titleContainer.appendChild(newCalendarBtn);
        }
    }
    
    
    let datePickerContainer = document.getElementById('headerDatePickerContainer');
    if (!datePickerContainer) {
        datePickerContainer = document.createElement('div');
        datePickerContainer.setAttribute('id', 'headerDatePickerContainer');
        datePickerContainer.style.display = 'none';
        datePickerContainer.style.position = 'absolute';
        datePickerContainer.style.zIndex = '9999';
        
        
        document.body.appendChild(datePickerContainer);
    }
    
    
    const dateInput = document.createElement('input');
    dateInput.setAttribute('type', 'text');
    dateInput.setAttribute('id', 'headerDatePicker');
    dateInput.style.display = 'none';
    datePickerContainer.appendChild(dateInput);
    
    
    const buttonReference = document.getElementById('headerCalendarBtn');
    
    
    const fp = flatpickr("#headerDatePicker", {
        dateFormat: "Y-m-d",
        defaultDate: "today",
        appendTo: datePickerContainer,
        inline: true,
        static: true,
        onChange: function (selectedDates, dateStr) {
            if (dateStr) {
                const formattedDate = dateStr.replaceAll("-", "_");
                fetch(`/get?timestamp=${formattedDate}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })
                .then(response => response.json())
                .then(data => {
                    const content = data.data;
                    if (content) {
                        
                        hugerte.get('editorjs').setContent(content);

                        const displayDate = new Date(dateStr);
                        const displayFormattedDate = displayDate.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        });
                        
                        const currDateElement = document.getElementById("curr-date");
                        if (currDateElement) {
                            currDateElement.innerHTML = "Diary - " + displayFormattedDate;
                        }
                        
                        
                        const normalDateElement = document.getElementById("normal-date");
                        if (normalDateElement) {
                            normalDateElement.innerHTML = dateStr;
                        }
                        
                        
                        if (window.Swal) {
                            Swal.fire({
                                icon: 'success',
                                title: 'Loaded!',
                                text: 'Your diary content has been loaded successfully.',
                                toast: true,
                                position: 'bottom-end',
                                showConfirmButton: false,
                                timer: 3000,
                                timerProgressBar: true,
                            });
                        }
                    } else {
                        
                        hugerte.get('editorjs').setContent("");
                        
                        const displayDate = new Date(dateStr);
                        const displayFormattedDate = displayDate.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        });
                        
                        const currDateElement = document.getElementById("curr-date");
                        if (currDateElement) {
                            currDateElement.innerHTML = "Diary - " + displayFormattedDate;
                        }
                        
                        
                        const normalDateElement = document.getElementById("normal-date");
                        if (normalDateElement) {
                            normalDateElement.innerHTML = dateStr;
                        }
                        
                        
                        if (window.Swal) {
                            Swal.fire({
                                icon: 'info',
                                title: 'New Entry',
                                text: 'Creating a new entry for this date.',
                                toast: true,
                                position: 'bottom-end',
                                showConfirmButton: false,
                                timer: 3000,
                                timerProgressBar: true,
                            });
                        }
                    }
                    
                    
                    datePickerContainer.style.display = 'none';
                })
                .catch(error => {
                    console.error('Error:', error);
                    if (window.Swal) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'An error occurred while fetching the content.',
                            toast: true,
                            position: 'bottom-end',
                            showConfirmButton: false,
                            timer: 3000,
                            timerProgressBar: true,
                        });
                    }
                });
            }
        }
    });
    
    
    buttonReference.addEventListener('click', function(e) {
        e.stopPropagation(); 
        
        if (datePickerContainer.style.display === 'none') {
            
            const btnRect = buttonReference.getBoundingClientRect();
            datePickerContainer.style.top = (btnRect.bottom + window.scrollY) + 'px';
            datePickerContainer.style.left = (btnRect.left + window.scrollX - 150) + 'px'; 
            datePickerContainer.style.display = 'block';
            
            
            setTimeout(() => {
                document.addEventListener('click', closeCalendarOnClickOutside);
            }, 100);
        } else {
            datePickerContainer.style.display = 'none';
            document.removeEventListener('click', closeCalendarOnClickOutside);
        }
    });
    
    
    function closeCalendarOnClickOutside(event) {
        if (!datePickerContainer.contains(event.target) && event.target !== buttonReference) {
            datePickerContainer.style.display = 'none';
            document.removeEventListener('click', closeCalendarOnClickOutside);
        }
    }
    
    
    if (!document.getElementById('calendar-button-styles')) {
        const style = document.createElement('style');
        style.id = 'calendar-button-styles';
        style.textContent = `
            .calendar-icon-btn {
                background: none;
                border: none;
                cursor: pointer;
                margin-left: 10px;
                font-size: 18px;
                vertical-align: middle;
            }
            
            .calendar-icon-btn:hover {
                opacity: 0.8;
            }
            
            #headerDatePickerContainer {
                z-index: 9999;
                margin-top: 5px;
                background: white;
                border-radius: 4px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }
        `;
        document.head.appendChild(style);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initHeaderCalendar();
});

hugerte.init({
    selector: '#editorjs',
    height: "80vh",
    width: "50vw",
    menubar: false,
    plugins: 'lists link image table code help',
    toolbar: 'undo redo | formatselect | bold italic | alignleft aligncenter alignright | bullist numlist | link image | savebutton | CorrectMistakes ConvertDiary',
    setup: function (editor) {
        editor.on('init', function () {
            pull_current_diary();
        });

        function showAlert(icon, title, text) {
            Swal.fire({
                icon: icon,
                title: title,
                text: text,
                toast: true,
                position: 'bottom-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
            });
        }

        editor.ui.registry.addButton('savebutton', {
            text: 'Save',
            icon: 'save',
            onAction: function () {
                const content = editor.getContent();
                const currDate = document.getElementById("normal-date").innerHTML
                timestamp = currDate.replaceAll("-", "_");
                fetch('/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content: content, timestamp: timestamp }),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showAlert('success', 'Saved!', 'Your diary has been saved successfully.');
                    } else {
                        showAlert('error', 'Error', 'Failed to save the diary.');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showAlert('error', 'Error', 'An error occurred while saving the file.');
                });
            }
        });

        editor.ui.registry.addButton('CorrectMistakes', {
            text: 'Correct',
            onAction: function () {
                const content = editor.getContent();
                const currDate = document.getElementById("normal-date").innerHTML
                timestamp = currDate.replaceAll("-", "_");
                fetch('/correct_mistakes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content: content, timestamp: timestamp }),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.result) {
                        editor.setContent(data.result);
                        showAlert('success', 'Corrected!', 'Your diary has been corrected successfully.');
                    } else {
                        showAlert('error', 'Error', 'No corrected content returned.');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showAlert('error', 'Error', 'An error occurred while correcting the file.');
                });
            }
        });

        editor.ui.registry.addButton('ConvertDiary', {
            text: 'Diary',
            onAction: function () {
                const content = editor.getContent();
                const currDate = document.getElementById("normal-date").innerHTML
                timestamp = currDate.replaceAll("-", "_");
                fetch('/diary', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content: content, timestamp: timestamp }),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.result) {
                        editor.setContent(data.result);
                        showAlert('success', 'Corrected!', 'Your diary has been corrected successfully.');
                    } else {
                        showAlert('error', 'Error', 'No corrected content returned.');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showAlert('error', 'Error', 'An error occurred while correcting the file.');
                });
            }
        });

    }

});

websocketInput.addEventListener("change", () => {
    const urlValue = websocketInput.value.trim();
    if (!urlValue.startsWith("ws://") && !urlValue.startsWith("wss://")) {
        statusText.textContent = "Invalid WebSocket URL (must start with ws.";
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
    
    let textContent = hugerte.get('editorjs').getContent();
    let newText = `${lines[0].text}`
    
    if (buffer_transcription) {
        newText += `<span style="opacity: 0.5; color: gray;"> ${buffer_transcription} </span>`;
    }

    textContent = textContent.replace(/<span style="opacity: 0.5; color: gray;">.*?<\/span>/g, "");

    const closingTagIndex = textContent.lastIndexOf('</p>');
    if (closingTagIndex !== -1) {
        textContent = textContent.slice(0, closingTagIndex) + newText + textContent.slice(closingTagIndex);
    } else {
        textContent = newText;
    }

    hugerte.get('editorjs').setContent("");
    hugerte.get('editorjs').setContent(textContent);

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