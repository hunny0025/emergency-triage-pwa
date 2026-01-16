// voice-service.js - Comprehensive voice features for emergency triage
class VoiceService {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.commands = new Map();
        this.lastCommand = null;
        this.isVoiceEnabled = false;
        this.voiceQueue = [];
        this.isSpeaking = false;
        this.initialize();
    }

    initialize() {
        console.log('Initializing Voice Service...');
        
        // Check browser support
        this.checkBrowserSupport();
        
        // Initialize speech recognition
        this.initSpeechRecognition();
        
        // Initialize speech synthesis voices
        this.loadVoices();
        
        // Setup default commands
        this.setupDefaultCommands();
        
        // Listen for voice button clicks
        this.setupUIListeners();
    }

    checkBrowserSupport() {
        const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        const hasSpeechSynthesis = 'speechSynthesis' in window;
        
        this.isVoiceEnabled = hasSpeechRecognition && hasSpeechSynthesis;
        
        if (!this.isVoiceEnabled) {
            console.warn('Voice features not supported in this browser');
            this.showWarning('Voice features require Chrome or Edge browser');
        }
    }

    initSpeechRecognition() {
        if (!this.isVoiceEnabled) return;
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Configure recognition
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;
        
        // Setup event handlers
        this.recognition.onstart = () => {
            console.log('Voice recognition started');
            this.isListening = true;
            this.updateVoiceUI(true);
        };
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript;
            const confidence = event.results[event.results.length - 1][0].confidence;
            
            console.log(`Voice input: "${transcript}" (${Math.round(confidence * 100)}% confidence)`);
            
            this.processVoiceCommand(transcript.toLowerCase().trim());
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.isListening = false;
            this.updateVoiceUI(false);
            
            if (event.error === 'not-allowed') {
                this.showWarning('Microphone access denied. Please allow microphone access for voice commands.');
            }
        };
        
        this.recognition.onend = () => {
            console.log('Voice recognition ended');
            this.isListening = false;
            this.updateVoiceUI(false);
            
            // Auto-restart listening if voice mode is active
            if (this.voiceModeActive) {
                setTimeout(() => this.startListening(), 500);
            }
        };
    }

    loadVoices() {
        // Wait for voices to be loaded
        setTimeout(() => {
            const voices = this.synthesis.getVoices();
            console.log(`Loaded ${voices.length} speech synthesis voices`);
            
            // Prefer female emergency-style voice
            const emergencyVoice = voices.find(voice => 
                voice.name.includes('Female') || 
                voice.name.includes('Susan') ||
                voice.name.includes('Zira')
            ) || voices[0];
            
            if (emergencyVoice) {
                this.defaultVoice = emergencyVoice;
            }
        }, 1000);
    }

    setupDefaultCommands() {
        // Navigation commands
        this.registerCommand('new patient', () => {
            this.speak('Opening new patient form');
            document.getElementById('patientName').focus();
            this.scrollToForm();
        });
        
        this.registerCommand('show queue', () => {
            this.speak('Showing patient queue');
            document.querySelector('.patients-list-container').scrollIntoView();
        });
        
        this.registerCommand('show dashboard', () => {
            this.speak('Showing dashboard');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        
        // Priority commands
        this.registerCommand('priority red', () => {
            this.setPriority('red');
            this.speak('Set priority to red - immediate attention required');
        });
        
        this.registerCommand('priority yellow', () => {
            this.setPriority('yellow');
            this.speak('Set priority to yellow - urgent');
        });
        
        this.registerCommand('priority green', () => {
            this.setPriority('green');
            this.speak('Set priority to green - delayed');
        });
        
        this.registerCommand('priority black', () => {
            this.setPriority('black');
            this.speak('Set priority to black - expectant');
        });
        
        // Form field commands
        this.registerCommand(['name', 'patient name'], () => {
            this.speak('Ready for patient name');
            document.getElementById('patientName').focus();
        });
        
        this.registerCommand(['age', 'patient age'], () => {
            this.speak('Ready for patient age');
            document.getElementById('age').focus();
        });
        
        this.registerCommand(['complaint', 'chief complaint'], () => {
            this.speak('Ready for chief complaint');
            document.getElementById('chiefComplaint').focus();
        });
        
        this.registerCommand(['notes', 'clinical notes'], () => {
            this.speak('Ready for clinical notes');
            document.getElementById('notes').focus();
        });
        
        // Vital signs commands
        this.registerCommand(['heart rate', 'pulse'], () => {
            this.speak('Ready for heart rate');
            document.getElementById('heartRate').focus();
        });
        
        this.registerCommand(['blood pressure', 'bp'], () => {
            this.speak('Ready for blood pressure');
            document.getElementById('bloodPressureSystolic').focus();
        });
        
        this.registerCommand(['oxygen', 'spo2', 'oxygen saturation'], () => {
            this.speak('Ready for oxygen saturation');
            document.getElementById('oxygenSaturation').focus();
        });
        
        this.registerCommand(['respiratory rate', 'breathing rate'], () => {
            this.speak('Ready for respiratory rate');
            document.getElementById('respiratoryRate').focus();
        });
        
        this.registerCommand(['temperature', 'temp'], () => {
            this.speak('Ready for temperature');
            document.getElementById('temperature').focus();
        });
        
        // Form actions
        this.registerCommand(['submit', 'save patient', 'add patient'], () => {
            this.speak('Saving patient');
            document.getElementById('patientForm').dispatchEvent(new Event('submit'));
        });
        
        this.registerCommand(['clear', 'clear form', 'reset'], () => {
            this.speak('Clearing form');
            document.getElementById('patientForm').reset();
        });
        
        // Emergency commands
        this.registerCommand(['emergency', 'mass casualty'], () => {
            this.speak('Activating mass casualty mode');
            document.getElementById('massCasualtyBtn').click();
        });
        
        this.registerCommand(['statistics', 'stats'], () => {
            this.speak('Showing statistics');
            this.readStatistics();
        });
        
        this.registerCommand(['next patient', 'next'], () => {
            this.speak('Moving to next patient');
            this.assignNextPatient();
        });
        
        // System commands
        this.registerCommand(['help', 'voice help'], () => {
            this.speak('Voice commands available: new patient, priority red, name, age, complaint, vital signs, submit, clear, emergency, statistics, stop listening');
        });
        
        this.registerCommand(['stop listening', 'stop voice', 'quiet'], () => {
            this.speak('Stopping voice recognition');
            this.stopListening();
            this.voiceModeActive = false;
        });
        
        // Numbers for form filling
        for (let i = 0; i <= 200; i++) {
            this.registerCommand(i.toString(), () => {
                const activeElement = document.activeElement;
                if (activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)) {
                    activeElement.value = i;
                    this.speak(`Set ${i}`);
                }
            });
        }
    }

    registerCommand(trigger, action) {
        if (Array.isArray(trigger)) {
            trigger.forEach(t => this.commands.set(t, action));
        } else {
            this.commands.set(trigger, action);
        }
    }

    setupUIListeners() {
        // Voice toggle button
        document.addEventListener('DOMContentLoaded', () => {
            const voiceBtn = document.getElementById('voiceToggleBtn');
            if (voiceBtn) {
                voiceBtn.addEventListener('click', () => this.toggleVoiceMode());
            }
            
            // Add voice buttons to form fields
            this.addVoiceButtonsToForm();
            
            // Setup keyboard shortcut (Ctrl+Shift+V)
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === 'V') {
                    e.preventDefault();
                    this.toggleVoiceMode();
                }
            });
        });
    }

    addVoiceButtonsToForm() {
        const formFields = [
            'patientName', 'age', 'chiefComplaint', 'notes',
            'heartRate', 'bloodPressureSystolic', 'oxygenSaturation',
            'respiratoryRate', 'temperature'
        ];
        
        formFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                const container = field.parentElement;
                if (container && !container.querySelector('.voice-input-btn')) {
                    const voiceBtn = document.createElement('button');
                    voiceBtn.type = 'button';
                    voiceBtn.className = 'voice-input-btn';
                    voiceBtn.innerHTML = '🎤';
                    voiceBtn.title = 'Voice input';
                    voiceBtn.setAttribute('aria-label', 'Voice input');
                    
                    voiceBtn.addEventListener('click', () => {
                        this.startListeningForField(fieldId);
                    });
                    
                    container.style.position = 'relative';
                    voiceBtn.style.position = 'absolute';
                    voiceBtn.style.right = '10px';
                    voiceBtn.style.top = '50%';
                    voiceBtn.style.transform = 'translateY(-50%)';
                    voiceBtn.style.background = 'none';
                    voiceBtn.style.border = 'none';
                    voiceBtn.style.fontSize = '1.2rem';
                    voiceBtn.style.cursor = 'pointer';
                    voiceBtn.style.zIndex = '10';
                    
                    container.appendChild(voiceBtn);
                }
            }
        });
    }

    toggleVoiceMode() {
        if (!this.isVoiceEnabled) {
            this.showWarning('Voice features not available in this browser');
            return;
        }
        
        this.voiceModeActive = !this.voiceModeActive;
        
        if (this.voiceModeActive) {
            this.speak('Voice mode activated. Say "help" for commands.');
            this.startListening();
            this.showNotification('Voice mode ACTIVE - Say "help" for commands', 'info');
        } else {
            this.stopListening();
            this.speak('Voice mode deactivated');
            this.showNotification('Voice mode deactivated', 'info');
        }
        
        this.updateVoiceUI(this.voiceModeActive);
    }

    startListening() {
        if (!this.isVoiceEnabled || !this.recognition) return;
        
        try {
            this.recognition.start();
        } catch (error) {
            console.error('Failed to start recognition:', error);
            // Try again after a short delay
            setTimeout(() => {
                if (this.voiceModeActive) {
                    this.recognition.start();
                }
            }, 100);
        }
    }

    startListeningForField(fieldId) {
        if (!this.isVoiceEnabled || !this.recognition) return;
        
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        field.focus();
        
        // Temporarily override command processing
        const originalCommands = new Map(this.commands);
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            field.value = transcript;
            
            // Trigger input event for any validation
            field.dispatchEvent(new Event('input', { bubbles: true }));
            
            this.speak(`Set ${fieldId.replace(/([A-Z])/g, ' $1').toLowerCase()} to ${transcript}`);
            
            // Restore original commands
            this.recognition.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript;
                this.processVoiceCommand(transcript.toLowerCase().trim());
            };
            
            this.commands = originalCommands;
        };
        
        this.recognition.start();
        this.speak(`Listening for ${fieldId.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    }

    stopListening() {
        if (!this.isVoiceEnabled || !this.recognition) return;
        
        try {
            this.recognition.stop();
        } catch (error) {
            console.error('Failed to stop recognition:', error);
        }
        
        this.isListening = false;
        this.updateVoiceUI(false);
    }

    processVoiceCommand(transcript) {
        console.log('Processing command:', transcript);
        
        // Store last command for debugging
        this.lastCommand = transcript;
        
        // Check for exact matches
        if (this.commands.has(transcript)) {
            this.commands.get(transcript)();
            return;
        }
        
        // Check for partial matches
        for (const [command, action] of this.commands.entries()) {
            if (transcript.includes(command)) {
                action();
                return;
            }
        }
        
        // If no command matched and we're in field input mode, fill the active field
        const activeElement = document.activeElement;
        if (activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
            activeElement.value = transcript;
            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            this.speak(`Set to ${transcript}`);
            return;
        }
        
        // Unknown command
        this.speak(`Command not recognized: ${transcript}. Say "help" for available commands.`);
    }

    speak(text, interrupt = false) {
        if (!this.isVoiceEnabled || !this.synthesis) return;
        
        if (interrupt) {
            this.synthesis.cancel();
        }
        
        // Queue the speech if already speaking
        if (this.isSpeaking && !interrupt) {
            this.voiceQueue.push(text);
            return;
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Configure voice
        if (this.defaultVoice) {
            utterance.voice = this.defaultVoice;
        }
        
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onstart = () => {
            this.isSpeaking = true;
        };
        
        utterance.onend = () => {
            this.isSpeaking = false;
            
            // Speak next in queue
            if (this.voiceQueue.length > 0) {
                const nextText = this.voiceQueue.shift();
                setTimeout(() => this.speak(nextText), 300);
            }
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            this.isSpeaking = false;
        };
        
        this.synthesis.speak(utterance);
    }

    setPriority(priority) {
        const prioritySelect = document.getElementById('triagePriority');
        if (prioritySelect) {
            prioritySelect.value = priority;
            
            // Highlight the corresponding priority card
            document.querySelectorAll('.triage-card').forEach(card => {
                card.classList.remove('active-priority');
                if (card.dataset.priority === priority) {
                    card.classList.add('active-priority');
                }
            });
        }
    }

    scrollToForm() {
        const form = document.querySelector('.patient-form-container');
        if (form) {
            form.scrollIntoView({ behavior: 'smooth' });
        }
    }

    readStatistics() {
        const stats = {
            red: parseInt(document.getElementById('redCount').textContent) || 0,
            yellow: parseInt(document.getElementById('yellowCount').textContent) || 0,
            green: parseInt(document.getElementById('greenCount').textContent) || 0,
            black: parseInt(document.getElementById('blackCount').textContent) || 0,
            total: parseInt(document.getElementById('totalPatientCount').textContent) || 0
        };
        
        const message = `Total patients: ${stats.total}. Priority Red: ${stats.red}. Priority Yellow: ${stats.yellow}. Priority Green: ${stats.green}. Priority Black: ${stats.black}.`;
        
        this.speak(message);
    }

    assignNextPatient() {
        // Find first waiting patient
        const waitingPatients = Array.from(document.querySelectorAll('.patient-item'))
            .filter(item => !item.querySelector('.action-btn.treat').disabled);
        
        if (waitingPatients.length > 0) {
            const nextPatient = waitingPatients[0];
            const patientName = nextPatient.querySelector('.patient-name').textContent;
            const priority = nextPatient.querySelector('.patient-priority').textContent;
            
            this.speak(`Next patient: ${patientName}. Priority: ${priority}.`);
            
            // Simulate clicking the treat button
            nextPatient.querySelector('.action-btn.treat').click();
        } else {
            this.speak('No patients waiting in queue');
        }
    }

    updateVoiceUI(isActive) {
        const voiceBtn = document.getElementById('voiceToggleBtn');
        if (voiceBtn) {
            if (isActive) {
                voiceBtn.innerHTML = '🎤🔴';
                voiceBtn.style.color = '#dc2626';
                voiceBtn.style.animation = 'pulse 1.5s infinite';
                voiceBtn.title = 'Voice mode ACTIVE - Click to turn off';
            } else {
                voiceBtn.innerHTML = '🎤';
                voiceBtn.style.color = '';
                voiceBtn.style.animation = '';
                voiceBtn.title = 'Click for voice commands (Ctrl+Shift+V)';
            }
        }
        
        // Update voice indicator in header
        const voiceIndicator = document.getElementById('voiceIndicator');
        if (voiceIndicator) {
            voiceIndicator.style.display = isActive ? 'flex' : 'none';
        }
    }

    showWarning(message) {
        console.warn(message);
        // You can implement a notification system here
        if (window.showNotification) {
            window.showNotification(message, 'warning');
        } else {
            alert(message);
        }
    }

    showNotification(message, type = 'info') {
        // Integrate with existing notification system
        console.log(`[${type}] ${message}`);
    }

    // Emergency broadcast - announce critical patients
    broadcastEmergency(patient) {
        const message = `Emergency alert! Patient ${patient.name}, priority ${patient.priority.toUpperCase()}, requires immediate attention. Chief complaint: ${patient.chiefComplaint}.`;
        
        this.speak(message, true);
        
        // Repeat after 30 seconds if still critical
        if (patient.priority === 'red') {
            setTimeout(() => {
                const stillCritical = document.querySelector(`[data-id="${patient.id}"]`);
                if (stillCritical) {
                    this.speak(`Reminder: ${patient.name} still requires immediate attention.`);
                }
            }, 30000);
        }
    }

    // Read patient details aloud
    readPatientDetails(patientId) {
        const patientItem = document.querySelector(`[data-id="${patientId}"]`);
        if (!patientItem) return;
        
        const name = patientItem.querySelector('.patient-name').textContent;
        const details = patientItem.querySelector('.patient-details').textContent;
        const vitals = patientItem.querySelector('.patient-vitals')?.textContent || '';
        
        const message = `Patient: ${name}. ${details}. ${vitals}`;
        this.speak(message);
    }

    // Auto-announce new critical patients
    autoAnnounceNewPatient(patient) {
        if (patient.priority === 'red') {
            setTimeout(() => {
                this.broadcastEmergency(patient);
            }, 1000);
        } else if (patient.priority === 'yellow') {
            setTimeout(() => {
                this.speak(`New urgent patient: ${patient.name}`);
            }, 1000);
        }
    }
}

// Create global instance
window.VoiceService = new VoiceService();