// app.js - Upline Emergency Triage PWA

// ============================================
// Main Application Class
// ============================================

class EmergencyTriageApp {
    constructor() {
        this.patients = [];
        this.nextPatientId = 1001;
        this.currentUser = null;
        this.isOffline = false;
        this.settings = {};
        this.voiceService = null;
        this.initializeApp();
    }

    // ============================================
    // Initialization Methods
    // ============================================

    async initializeApp() {
        console.log('🚑 Initializing Upline Emergency Triage PWA...');
        
        // Initialize all components
        await this.loadAllData();
        this.setupUI();
        this.setupEventListeners();
        this.setupServiceWorker();
        this.setupVoiceService();
        this.updateConnectionStatus();
        this.updateTime();
        
        // Start periodic updates
        this.startPeriodicUpdates();
        
        // Show welcome
        setTimeout(() => {
            this.showNotification('Emergency Triage System Ready', 'success');
        }, 1000);
    }

    async loadAllData() {
        // Load patients
        this.patients = await this.loadFromStorage('upline-patients') || [];
        
        // Load settings
        this.settings = await this.loadFromStorage('triage-settings') || {
            triageProtocol: 'standard',
            autoPriority: true,
            notificationSound: true,
            dataRetention: 30,
            voiceEnabled: true
        };
        
        // Load user info
        this.currentUser = await this.loadFromStorage('current-user') || {
            id: 'user_' + Date.now(),
            name: 'Emergency Responder',
            role: 'paramedic',
            department: 'Emergency'
        };
        
        // Update next patient ID
        if (this.patients.length > 0) {
            const maxId = Math.max(...this.patients.map(p => {
                const match = p.id ? p.id.match(/\d+/g) : null;
                return match ? parseInt(match[match.length - 1]) : 0;
            }));
            this.nextPatientId = maxId + 1;
        }
        
        console.log(`📊 Loaded ${this.patients.length} patients from storage`);
    }

    setupUI() {
        this.updatePatientCounts();
        this.renderPatients();
        this.updateDashboard();
        this.setupDarkMode();
        this.updateTimeDisplay();
    }

    setupEventListeners() {
        // PWA install
        window.addEventListener('beforeinstallprompt', (e) => this.handleBeforeInstallPrompt(e));
        window.addEventListener('appinstalled', () => this.handleAppInstalled());
        
        // Online/offline status
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Form submission
        const patientForm = document.getElementById('patientForm');
        if (patientForm) {
            patientForm.addEventListener('submit', (e) => this.handlePatientSubmit(e));
        }
        
        // Clear form button
        const clearFormBtn = document.getElementById('clearFormBtn');
        if (clearFormBtn) {
            clearFormBtn.addEventListener('click', () => this.clearForm());
        }
        
        // Triage card clicks
        document.querySelectorAll('.triage-card').forEach(card => {
            card.addEventListener('click', () => {
                const priority = card.dataset.priority;
                this.setPriority(priority);
            });
        });
        
        // Add emergency button
        const addEmergencyBtn = document.getElementById('addEmergencyBtn');
        if (addEmergencyBtn) {
            addEmergencyBtn.addEventListener('click', () => this.addEmergencyPatient());
        }
        
        // Voice toggle button
        const voiceToggleBtn = document.getElementById('voiceToggleBtn');
        if (voiceToggleBtn) {
            voiceToggleBtn.addEventListener('click', () => this.toggleVoiceMode());
        }
        
        // Voice help button
        const voiceHelpBtn = document.getElementById('voiceHelpBtn');
        if (voiceHelpBtn) {
            voiceHelpBtn.addEventListener('click', () => this.showVoiceHelp());
        }
        
        // Control panel buttons
        this.setupControlPanelListeners();
        
        // Voice input buttons
        this.setupVoiceInputButtons();
        
        // Keyboard shortcuts
        this.setupKeyboardShortcuts();
    }

    setupControlPanelListeners() {
        const buttons = {
            'massCasualtyBtn': () => this.activateMassCasualtyMode(),
            'calculatePriority': () => this.calculateAutoPriority(),
            'exportDataBtn': () => this.exportData(),
            'importDataBtn': () => this.importData(),
            'settingsBtn': () => this.showSettings()
        };
        
        Object.entries(buttons).forEach(([id, handler]) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', handler);
            }
        });
    }

    setupVoiceInputButtons() {
        document.querySelectorAll('.voice-input-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const fieldId = btn.dataset.field;
                if (this.voiceService && this.voiceService.isVoiceEnabled) {
                    this.voiceService.startListeningForField(fieldId);
                } else {
                    this.showNotification('Voice features not available', 'warning');
                }
            });
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+V for voice toggle
            if (e.ctrlKey && e.shiftKey && e.key === 'V') {
                e.preventDefault();
                this.toggleVoiceMode();
            }
            
            // Ctrl+Shift+H for voice help
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                this.showVoiceHelp();
            }
            
            // Escape to stop voice
            if (e.key === 'Escape' && this.voiceService?.voiceModeActive) {
                this.voiceService.stopListening();
            }
            
            // Ctrl+Enter to submit form
            if (e.ctrlKey && e.key === 'Enter' && document.activeElement.closest('#patientForm')) {
                document.getElementById('patientForm').dispatchEvent(new Event('submit'));
            }
        });
    }

    // ============================================
    // Service Worker Methods
    // ============================================

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('✅ Service Worker registered with scope:', registration.scope);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        console.log('New service worker found:', newWorker);
                        
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                this.showNotification('New version available! Refresh to update.', 'info');
                            }
                        });
                    });
                })
                .catch(error => {
                    console.error('❌ Service Worker registration failed:', error);
                    this.showNotification('Service Worker registration failed', 'error');
                });
        }
    }

    // ============================================
    // Voice Service Methods
    // ============================================

    setupVoiceService() {
        if (this.settings.voiceEnabled) {
            this.voiceService = new VoiceService(this);
            window.voiceService = this.voiceService;
            
            // Auto-show voice tutorial on first use
            if (!localStorage.getItem('voiceTutorialShown')) {
                setTimeout(() => {
                    if (this.voiceService.isVoiceEnabled) {
                        this.showVoiceTutorial();
                    }
                }, 2000);
            }
        }
    }

    toggleVoiceMode() {
        if (this.voiceService) {
            this.voiceService.toggleVoiceMode();
        } else {
            this.showNotification('Voice service not initialized', 'warning');
        }
    }

    showVoiceHelp() {
        const panel = document.getElementById('voiceCommandsPanel');
        if (panel) {
            panel.style.display = 'block';
            panel.style.animation = 'slideIn 0.3s ease';
        }
    }

    showVoiceTutorial() {
        // Create tutorial overlay
        const tutorial = document.createElement('div');
        tutorial.className = 'voice-tutorial-overlay';
        tutorial.innerHTML = `
            <div class="tutorial-content">
                <h2>🎤 Voice Control Tutorial</h2>
                <p>You can now control the triage system using voice commands.</p>
                
                <div class="tutorial-examples">
                    <p><strong>Try saying:</strong></p>
                    <ul>
                        <li>"New patient" - Start new assessment</li>
                        <li>"Priority red" - Set immediate priority</li>
                        <li>"Name John Smith" - Enter patient name</li>
                        <li>"Submit" - Save patient</li>
                    </ul>
                </div>
                
                <div class="tutorial-buttons">
                    <button class="btn btn-primary" id="startVoiceTutorial">
                        Start Tutorial
                    </button>
                    <button class="btn btn-secondary" id="skipVoiceTutorial">
                        Skip Tutorial
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(tutorial);
        
        // Add event listeners
        document.getElementById('startVoiceTutorial').addEventListener('click', () => {
            tutorial.remove();
            this.startVoiceTutorial();
        });
        
        document.getElementById('skipVoiceTutorial').addEventListener('click', () => {
            tutorial.remove();
            localStorage.setItem('voiceTutorialShown', 'true');
            this.showNotification('Voice tutorial skipped', 'info');
        });
        
        localStorage.setItem('voiceTutorialShown', 'true');
    }

    startVoiceTutorial() {
        if (this.voiceService) {
            this.voiceService.voiceModeActive = true;
            this.voiceService.startListening();
            this.voiceService.updateVoiceUI(true);
            
            // Step-by-step tutorial
            setTimeout(() => {
                this.voiceService.speak("Welcome to voice control tutorial. Let's add a new patient. Say 'new patient'.");
            }, 1000);
        }
    }

    // ============================================
    // Patient Management Methods
    // ============================================

    async handlePatientSubmit(event) {
        event.preventDefault();
        
        // Get form data
        const formData = new FormData(event.target);
        const patientData = Object.fromEntries(formData);
        
        // Validate required fields
        if (!patientData.patientName || !patientData.age || !patientData.gender || !patientData.chiefComplaint || !patientData.triagePriority) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        // Calculate priority if auto-priority is enabled
        if (this.settings.autoPriority && !patientData.triagePriority) {
            patientData.triagePriority = this.calculatePriorityFromVitals(patientData);
        }
        
        // Create patient object
        const patient = {
            id: patientData.patientId || `PAT-${this.nextPatientId}`,
            name: patientData.patientName,
            age: parseInt(patientData.age),
            gender: patientData.gender,
            vitalSigns: {
                heartRate: patientData.heartRate || 'Not recorded',
                bloodPressure: patientData.bloodPressureSystolic || 'Not recorded',
                respiratoryRate: patientData.respiratoryRate || 'Not recorded',
                oxygenSaturation: patientData.oxygenSaturation || 'Not recorded',
                temperature: patientData.temperature || 'Not recorded'
            },
            chiefComplaint: patientData.chiefComplaint,
            notes: patientData.notes || '',
            priority: patientData.triagePriority,
            timestamp: new Date().toISOString(),
            arrivalTime: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            status: 'waiting',
            assignedTo: null,
            location: this.getGeolocation(),
            deviceId: this.currentUser.id,
            syncStatus: navigator.onLine ? 'synced' : 'pending'
        };
        
        // Add to patients array
        this.patients.unshift(patient);
        this.nextPatientId++;
        
        // Save to storage
        await this.saveToStorage('upline-patients', this.patients);
        
        // Update UI
        this.renderPatients();
        this.updatePatientCounts();
        this.updateDashboard();
        this.clearForm();
        
        // Show success message
        const priorityNames = {
            red: 'Priority 1 (Red)',
            yellow: 'Priority 2 (Yellow)',
            green: 'Priority 3 (Green)',
            black: 'Priority 4 (Black)'
        };
        
        this.showNotification(`Patient ${patient.name} added to ${priorityNames[patient.priority]} queue`, 'success');
        
        // Voice announcement
        if (this.voiceService && this.voiceService.voiceModeActive) {
            this.voiceService.autoAnnounceNewPatient(patient);
        }
        
        // Trigger emergency protocol if red priority
        if (patient.priority === 'red') {
            this.triggerEmergencyProtocol(patient);
        }
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
    }

    calculatePriorityFromVitals(patientData) {
        let score = 0;
        
        // Heart rate scoring
        const hr = parseInt(patientData.heartRate) || 80;
        if (hr < 50 || hr > 120) score += 2;
        if (hr < 40 || hr > 140) score += 3;
        
        // Blood pressure scoring
        const bp = parseInt(patientData.bloodPressureSystolic) || 120;
        if (bp < 90 || bp > 160) score += 2;
        if (bp < 70 || bp > 180) score += 3;
        
        // Oxygen saturation scoring
        const spo2 = parseInt(patientData.oxygenSaturation) || 98;
        if (spo2 < 94) score += 2;
        if (spo2 < 90) score += 3;
        
        // Respiratory rate scoring
        const rr = parseInt(patientData.respiratoryRate) || 16;
        if (rr < 12 || rr > 20) score += 1;
        if (rr < 8 || rr > 24) score += 2;
        
        // Determine priority based on score
        if (score >= 6) return 'red';
        if (score >= 4) return 'yellow';
        if (score >= 2) return 'green';
        return 'green';
    }

    calculateAutoPriority() {
        const patientData = {
            heartRate: document.getElementById('heartRate').value,
            bloodPressureSystolic: document.getElementById('bloodPressureSystolic').value,
            oxygenSaturation: document.getElementById('oxygenSaturation').value,
            respiratoryRate: document.getElementById('respiratoryRate').value
        };
        
        const priority = this.calculatePriorityFromVitals(patientData);
        this.setPriority(priority);
        
        this.showNotification(`Auto-calculated priority: ${priority.toUpperCase()}`, 'info');
    }

    clearForm() {
        const form = document.getElementById('patientForm');
        if (form) {
            form.reset();
            document.getElementById('patientId').value = `PAT-${this.nextPatientId}`;
            document.getElementById('patientName').focus();
        }
    }

    addEmergencyPatient() {
        document.getElementById('patientId').value = `EMG-${this.nextPatientId}`;
        document.getElementById('patientName').value = "Emergency Patient";
        document.getElementById('age').value = Math.floor(Math.random() * 80) + 20;
        document.getElementById('gender').value = ["male", "female"][Math.floor(Math.random() * 2)];
        document.getElementById('chiefComplaint').value = "Multiple trauma";
        document.getElementById('triagePriority').value = "red";
        document.getElementById('notes').value = "Mass casualty incident, multiple injuries";
        
        document.querySelector('.patient-form-container').scrollIntoView({ behavior: 'smooth' });
        document.getElementById('patientName').focus();
    }

    // ============================================
    // Patient List Management
    // ============================================

    renderPatients() {
        const patientsList = document.getElementById('patientsList');
        if (!patientsList) return;
        
        if (this.patients.length === 0) {
            patientsList.innerHTML = `
                <div class="no-patients" style="text-align: center; padding: 40px; color: #6b7280;">
                    <p>No patients in the triage queue yet.</p>
                    <p>Add a new patient using the form above.</p>
                </div>
            `;
            return;
        }
        
        // Sort by priority and timestamp
        const priorityOrder = { red: 0, yellow: 1, green: 2, black: 3 };
        const sortedPatients = [...this.patients].sort((a, b) => {
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Generate HTML
        let patientsHTML = '';
        
        sortedPatients.forEach(patient => {
            const priorityClass = `priority-${patient.priority}`;
            const priorityText = patient.priority === 'red' ? 'P1' :
                               patient.priority === 'yellow' ? 'P2' :
                               patient.priority === 'green' ? 'P3' : 'P4';
            
            const timeAgo = this.getTimeAgo(patient.timestamp);
            
            patientsHTML += `
                <div class="patient-item" data-id="${patient.id}">
                    <div class="patient-priority ${priorityClass}">${priorityText}</div>
                    <div class="patient-info">
                        <div class="patient-name">${this.escapeHtml(patient.name)} (${patient.age}${patient.gender === 'male' ? 'M' : 'F'})</div>
                        <div class="patient-details">
                            <span class="patient-complaint">${this.escapeHtml(patient.chiefComplaint)}</span>
                            <span class="patient-time">Arrived: ${patient.arrivalTime}</span>
                            <span class="patient-time">${timeAgo}</span>
                        </div>
                        <div class="patient-vitals">
                            <small>HR: ${patient.vitalSigns.heartRate} | BP: ${patient.vitalSigns.bloodPressure} | SpO₂: ${patient.vitalSigns.oxygenSaturation}%</small>
                        </div>
                    </div>
                    <div class="patient-actions">
                        <button class="action-btn treat" onclick="app.treatPatient('${patient.id}')">🚑 Treat</button>
                        <button class="action-btn details" onclick="app.showPatientDetails('${patient.id}')">📋 Details</button>
                    </div>
                </div>
            `;
        });
        
        patientsList.innerHTML = patientsHTML;
    }

    updatePatientCounts() {
        const counts = {
            red: this.patients.filter(p => p.priority === 'red').length,
            yellow: this.patients.filter(p => p.priority === 'yellow').length,
            green: this.patients.filter(p => p.priority === 'green').length,
            black: this.patients.filter(p => p.priority === 'black').length
        };
        
        // Update count elements
        const countElements = {
            'redCount': counts.red,
            'yellowCount': counts.yellow,
            'greenCount': counts.green,
            'blackCount': counts.black,
            'totalPatientCount': this.patients.length,
            'statsRed': counts.red,
            'statsYellow': counts.yellow,
            'statsPatients': this.patients.length
        };
        
        Object.entries(countElements).forEach(([id, count]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = count;
            }
        });
        
        // Update emergency alert
        const total = this.patients.length;
        const patientCountAlert = document.getElementById('patientCountAlert');
        if (patientCountAlert) {
            patientCountAlert.textContent = total === 0 ? 'No patients in queue' : 
                                          `${total} patient${total === 1 ? '' : 's'} in queue`;
        }
        
        // Update document title
        document.title = total > 0 ? `(${total}) Upline Emergency Triage` : 'Upline Emergency Triage';
    }

    treatPatient(patientId) {
        const patientIndex = this.patients.findIndex(p => p.id === patientId);
        if (patientIndex === -1) return;
        
        const patient = this.patients[patientIndex];
        this.showNotification(`Treating patient: ${patient.name}`, 'success');
        
        // Remove patient
        this.patients.splice(patientIndex, 1);
        
        // Update storage and UI
        this.saveToStorage('upline-patients', this.patients);
        this.renderPatients();
        this.updatePatientCounts();
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate([50, 50, 50]);
        }
    }

    showPatientDetails(patientId) {
        const patient = this.patients.find(p => p.id === patientId);
        if (!patient) return;
        
        // Create modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1001;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        
        modal.innerHTML = `
            <div style="background:white;border-radius:12px;padding:30px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;">
                <h3 style="margin-bottom:20px;color:#dc2626;">Patient Details</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div><strong>ID:</strong> ${patient.id}</div>
                    <div><strong>Name:</strong> ${patient.name}</div>
                    <div><strong>Age:</strong> ${patient.age}</div>
                    <div><strong>Gender:</strong> ${patient.gender}</div>
                    <div><strong>Priority:</strong> <span style="color:${patient.priority === 'red' ? '#dc2626' : patient.priority === 'yellow' ? '#ca8a04' : patient.priority === 'green' ? '#16a34a' : '#1f2937'}">${patient.priority.toUpperCase()}</span></div>
                    <div><strong>Status:</strong> ${patient.status}</div>
                </div>
                <div style="margin-bottom:20px;">
                    <strong>Chief Complaint:</strong><br>
                    ${patient.chiefComplaint}
                </div>
                <div style="margin-bottom:20px;">
                    <strong>Vital Signs:</strong><br>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                        <div>HR: ${patient.vitalSigns.heartRate} bpm</div>
                        <div>BP: ${patient.vitalSigns.bloodPressure} mmHg</div>
                        <div>RR: ${patient.vitalSigns.respiratoryRate} rpm</div>
                        <div>SpO₂: ${patient.vitalSigns.oxygenSaturation}%</div>
                        <div>Temp: ${patient.vitalSigns.temperature}°C</div>
                    </div>
                </div>
                <div style="margin-bottom:20px;">
                    <strong>Notes:</strong><br>
                    ${patient.notes || 'None'}
                </div>
                <div style="margin-bottom:20px;">
                    <strong>Arrival Time:</strong> ${new Date(patient.timestamp).toLocaleString()}
                </div>
                <button onclick="this.closest('div[style*=\"position:fixed\"]').remove()" style="background:#dc2626;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;width:100%;font-weight:600;">
                    Close
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // ============================================
    // Dashboard and Statistics
    // ============================================

    updateDashboard() {
        const stats = this.calculateStatistics();
        
        // Update stat cards
        const statElements = {
            'statsRed': stats.red,
            'statsYellow': stats.yellow,
            'statsPatients': stats.total,
            'avgWaitTime': `${stats.avgWaitTime}m`,
            'statsGreen': stats.green,
            'statsBlack': stats.black
        };
        
        Object.entries(statElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
        
        // Update charts if available
        this.updateCharts(stats);
    }

    calculateStatistics() {
        const now = Date.now();
        const redPatients = this.patients.filter(p => p.priority === 'red');
        const waitingTimes = this.patients
            .filter(p => p.timestamp)
            .map(p => (now - new Date(p.timestamp).getTime()) / 60000); // minutes
        
        return {
            total: this.patients.length,
            red: this.patients.filter(p => p.priority === 'red').length,
            yellow: this.patients.filter(p => p.priority === 'yellow').length,
            green: this.patients.filter(p => p.priority === 'green').length,
            black: this.patients.filter(p => p.priority === 'black').length,
            avgWaitTime: waitingTimes.length > 0 ? 
                Math.round(waitingTimes.reduce((a, b) => a + b) / waitingTimes.length) : 0,
            longestWait: waitingTimes.length > 0 ? Math.round(Math.max(...waitingTimes)) : 0
        };
    }

    updateCharts(stats) {
        // Simple chart using canvas
        const canvas = document.getElementById('triageChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw bar chart
            const colors = ['#dc2626', '#ca8a04', '#16a34a', '#1f2937'];
            const priorities = ['red', 'yellow', 'green', 'black'];
            const maxCount = Math.max(stats.red, stats.yellow, stats.green, stats.black, 1);
            
            priorities.forEach((priority, index) => {
                const count = stats[priority];
                const height = (count / maxCount) * 100;
                
                ctx.fillStyle = colors[index];
                ctx.fillRect(
                    index * 50 + 10,
                    150 - height,
                    40,
                    height
                );
                
                // Labels
                ctx.fillStyle = '#374151';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(
                    priority.toUpperCase(),
                    index * 50 + 30,
                    170
                );
                ctx.fillText(
                    count.toString(),
                    index * 50 + 30,
                    140 - height
                );
            });
        }
    }

    // ============================================
    // Emergency Protocols
    // ============================================

    triggerEmergencyProtocol(patient) {
        const alertElement = document.getElementById('emergencyAlert');
        if (!alertElement) return;
        
        alertElement.innerHTML = `
            <div class="alert-content">
                <div class="alert-icon">🚨</div>
                <div>
                    <strong>CRITICAL PATIENT ALERT</strong><br>
                    ${patient.name} - ${patient.chiefComplaint}<br>
                    Priority: RED - Immediate attention required
                </div>
            </div>
            <button class="btn btn-primary" onclick="app.assignToSelf('${patient.id}')">
                👨‍⚕️ Take Case
            </button>
        `;
        
        // Make alert pulse
        alertElement.style.animation = 'alert-pulse 1s infinite';
        
        // Send notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🚨 Critical Patient Alert', {
                body: `${patient.name} requires immediate attention`,
                icon: '/icon-192.png',
                requireInteraction: true
            });
        }
        
        // Log emergency
        this.logEvent('emergency_alert', { patientId: patient.id });
    }

    assignToSelf(patientId) {
        const patient = this.patients.find(p => p.id === patientId);
        if (patient) {
            patient.assignedTo = this.currentUser.name;
            patient.status = 'in_progress';
            
            this.saveToStorage('upline-patients', this.patients);
            this.renderPatients();
            
            this.showNotification(`Assigned ${patient.name} to yourself`, 'success');
            
            // Reset alert
            const alertElement = document.getElementById('emergencyAlert');
            if (alertElement) {
                alertElement.innerHTML = `
                    <div class="alert-content">
                        <div class="alert-icon">⚠️</div>
                        <div>
                            <strong>EMERGENCY MODE ACTIVE</strong> - Triage system is operational
                            <span id="patientCountAlert">${this.patients.length} patient${this.patients.length !== 1 ? 's' : ''} in queue</span>
                        </div>
                    </div>
                    <button id="addEmergencyBtn" class="btn btn-primary">➕ New Emergency</button>
                `;
                alertElement.style.animation = 'alert-pulse 2s infinite';
                
                // Reattach event listener
                document.getElementById('addEmergencyBtn').addEventListener('click', () => this.addEmergencyPatient());
            }
        }
    }

    activateMassCasualtyMode() {
        this.settings.triageProtocol = 'mass_casualty';
        this.showNotification('Mass Casualty Mode Activated', 'warning');
        
        // Show quick triage interface
        const formContainer = document.querySelector('.patient-form-container');
        if (formContainer) {
            formContainer.classList.add('mass-casualty-mode');
            
            // Add quick triage buttons
            const quickTriageDiv = document.createElement('div');
            quickTriageDiv.className = 'quick-triage';
            quickTriageDiv.innerHTML = `
                <h3>🚨 Quick Triage (MCI Protocol)</h3>
                <div class="quick-buttons">
                    <button class="triage-quick red" onclick="app.quickTriage('red')">
                        🚨 Immediate (Red)
                    </button>
                    <button class="triage-quick yellow" onclick="app.quickTriage('yellow')">
                        ⚠️ Urgent (Yellow)
                    </button>
                    <button class="triage-quick green" onclick="app.quickTriage('green')">
                        ✅ Delayed (Green)
                    </button>
                    <button class="triage-quick black" onclick="app.quickTriage('black')">
                        ⚫ Expectant (Black)
                    </button>
                </div>
            `;
            
            // Add styles for quick triage
            const style = document.createElement('style');
            style.textContent = `
                .quick-triage {
                    background: #fef2f2;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                    border: 2px solid #dc2626;
                }
                .quick-buttons {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 10px;
                    margin-top: 15px;
                }
                .triage-quick {
                    padding: 15px;
                    border: none;
                    border-radius: 8px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: transform 0.2s;
                }
                .triage-quick:hover {
                    transform: scale(1.05);
                }
                .triage-quick.red { background: #dc2626; color: white; }
                .triage-quick.yellow { background: #ca8a04; color: white; }
                .triage-quick.green { background: #16a34a; color: white; }
                .triage-quick.black { background: #1f2937; color: white; }
            `;
            document.head.appendChild(style);
            
            formContainer.insertBefore(quickTriageDiv, formContainer.firstChild);
        }
    }

    quickTriage(priority) {
        const patient = {
            id: `MCI-${Date.now()}`,
            name: `MCI Patient ${Math.floor(Math.random() * 1000)}`,
            age: Math.floor(Math.random() * 80) + 10,
            gender: ['male', 'female'][Math.floor(Math.random() * 2)],
            chiefComplaint: 'Mass casualty injury',
            priority: priority,
            timestamp: new Date().toISOString(),
            status: 'waiting',
            vitalSigns: {
                heartRate: 'Not recorded',
                bloodPressure: 'Not recorded',
                respiratoryRate: 'Not recorded',
                oxygenSaturation: 'Not recorded',
                temperature: 'Not recorded'
            }
        };
        
        this.patients.unshift(patient);
        this.saveToStorage('upline-patients', this.patients);
        
        this.renderPatients();
        this.updatePatientCounts();
        
        this.showNotification(`Added ${priority.toUpperCase()} priority patient`, 'info');
    }

    // ============================================
    // Data Import/Export
    // ============================================

    exportData() {
        const data = {
            patients: this.patients,
            metadata: {
                exportedAt: new Date().toISOString(),
                totalPatients: this.patients.length,
                appVersion: '1.0.0',
                user: this.currentUser
            }
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `upline-triage-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Data exported successfully', 'success');
    }

    async importData() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return resolve(false);
                
                const reader = new FileReader();
                
                reader.onload = async (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        
                        if (data.patients && Array.isArray(data.patients)) {
                            // Merge with existing patients
                            this.patients = [...data.patients, ...this.patients];
                            
                            // Remove duplicates based on ID
                            const uniqueIds = new Set();
                            this.patients = this.patients.filter(p => {
                                if (uniqueIds.has(p.id)) return false;
                                uniqueIds.add(p.id);
                                return true;
                            });
                            
                            await this.saveToStorage('upline-patients', this.patients);
                            
                            this.updatePatientCounts();
                            this.renderPatients();
                            this.showNotification(`Imported ${data.patients.length} patients`, 'success');
                        } else {
                            throw new Error('Invalid data format');
                        }
                    } catch (error) {
                        this.showNotification('Failed to import data: Invalid format', 'error');
                        console.error('Import error:', error);
                    }
                    resolve(true);
                };
                
                reader.readAsText(file);
            };
            
            input.click();
        });
    }

    // ============================================
    // Settings Management
    // ============================================

    showSettings() {
        // Create settings modal
        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: 20px;
        `;
        
        modal.innerHTML = `
            <div style="background:white;border-radius:12px;padding:30px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;">
                <h2 style="margin-bottom:20px;color:#1f2937;">⚙️ System Settings</h2>
                
                <div style="margin-bottom:20px;">
                    <h3 style="margin-bottom:10px;color:#4f46e5;">Triage Protocol</h3>
                    <select id="triageProtocol" style="width:100%;padding:10px;border-radius:8px;border:2px solid #e5e7eb;">
                        <option value="standard" ${this.settings.triageProtocol === 'standard' ? 'selected' : ''}>Standard Protocol</option>
                        <option value="mass_casualty" ${this.settings.triageProtocol === 'mass_casualty' ? 'selected' : ''}>Mass Casualty Protocol</option>
                        <option value="pediatric" ${this.settings.triageProtocol === 'pediatric' ? 'selected' : ''}>Pediatric Protocol</option>
                    </select>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <input type="checkbox" id="autoPriority" ${this.settings.autoPriority ? 'checked' : ''}>
                        Automatic Priority Calculation
                    </label>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <input type="checkbox" id="notificationSound" ${this.settings.notificationSound ? 'checked' : ''}>
                        Enable Notification Sounds
                    </label>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <input type="checkbox" id="voiceEnabled" ${this.settings.voiceEnabled ? 'checked' : ''}>
                        Enable Voice Features
                    </label>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label>
                        Data Retention (days):
                        <input type="number" id="dataRetention" value="${this.settings.dataRetention}" min="1" max="365" style="width:100%;padding:10px;border-radius:8px;border:2px solid #e5e7eb;margin-top:5px;">
                    </label>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label>
                        User Role:
                        <select id="userRole" style="width:100%;padding:10px;border-radius:8px;border:2px solid #e5e7eb;margin-top:5px;">
                            <option value="paramedic" ${this.currentUser.role === 'paramedic' ? 'selected' : ''}>Paramedic</option>
                            <option value="nurse" ${this.currentUser.role === 'nurse' ? 'selected' : ''}>Nurse</option>
                            <option value="doctor" ${this.currentUser.role === 'doctor' ? 'selected' : ''}>Doctor</option>
                            <option value="coordinator" ${this.currentUser.role === 'coordinator' ? 'selected' : ''}>Coordinator</option>
                        </select>
                    </label>
                </div>
                
                <div style="display:flex;gap:15px;margin-top:30px;">
                    <button class="btn btn-secondary" onclick="this.closest('.settings-modal').remove()" style="flex:1;">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="app.saveSettings()" style="flex:1;">
                        Save Settings
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async saveSettings() {
        this.settings = {
            triageProtocol: document.getElementById('triageProtocol').value,
            autoPriority: document.getElementById('autoPriority').checked,
            notificationSound: document.getElementById('notificationSound').checked,
            voiceEnabled: document.getElementById('voiceEnabled').checked,
            dataRetention: parseInt(document.getElementById('dataRetention').value) || 30
        };
        
        this.currentUser.role = document.getElementById('userRole').value;
        
        await this.saveToStorage('triage-settings', this.settings);
        await this.saveToStorage('current-user', this.currentUser);
        
        // Remove settings modal
        document.querySelector('.settings-modal').remove();
        
        // Reinitialize voice service if needed
        if (this.settings.voiceEnabled && !this.voiceService) {
            this.setupVoiceService();
        } else if (!this.settings.voiceEnabled && this.voiceService) {
            this.voiceService.stopListening();
            this.voiceService = null;
        }
        
        this.showNotification('Settings saved successfully', 'success');
    }

    // ============================================
    // Utility Methods
    // ============================================

    async saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving to storage:', error);
            this.showNotification('Error saving data', 'error');
            return false;
        }
    }

    async loadFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error loading from storage:', error);
            return null;
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-text">${message}</span>
            <button class="notification-close">×</button>
        `;
        
        document.body.appendChild(notification);
        
        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        });
        
        // Auto-remove
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
        
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Emergency Triage', {
                body: message,
                icon: 'icon-192.png'
            });
        }
        
        // Play sound if enabled
        if (this.settings.notificationSound) {
            this.playNotificationSound();
        }
    }

    playNotificationSound() {
        try {
            // Create a simple beep sound
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.error('Error playing notification sound:', error);
        }
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const then = new Date(timestamp).getTime();
        const diff = now - then;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    updateTime() {
        const now = new Date();
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        
        const syncTimeElement = document.getElementById('lastSyncTime');
        if (syncTimeElement) {
            syncTimeElement.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
    }

    updateTimeDisplay() {
        this.updateTime();
        setInterval(() => this.updateTime(), 60000); // Update every minute
    }

    setPriority(priority) {
        const prioritySelect = document.getElementById('triagePriority');
        if (prioritySelect) {
            prioritySelect.value = priority;
            this.highlightPriorityCard(priority);
        }
    }

    highlightPriorityCard(priority) {
        document.querySelectorAll('.triage-card').forEach(card => {
            card.classList.remove('active-priority');
            if (card.dataset.priority === priority) {
                card.classList.add('active-priority');
            }
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getGeolocation() {
        // Simplified geolocation - in real app, use navigator.geolocation
        return {
            latitude: null,
            longitude: null,
            accuracy: null,
            timestamp: new Date().toISOString()
        };
    }

    logEvent(eventType, data) {
        // Log event to console (in real app, send to analytics)
        console.log(`Event: ${eventType}`, data);
    }

    setupDarkMode() {
        // Check for dark mode preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-mode');
        }
        
        // Listen for changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (e.matches) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        });
    }

    startPeriodicUpdates() {
        // Update stats every 30 seconds
        setInterval(() => {
            this.updateDashboard();
        }, 30000);
        
        // Auto-save every minute
        setInterval(async () => {
            await this.saveToStorage('upline-patients', this.patients);
        }, 60000);
    }

    // ============================================
    // PWA Installation
    // ============================================

    handleBeforeInstallPrompt(e) {
        e.preventDefault();
        window.deferredPrompt = e;
        
        const installBtn = document.getElementById('installBtn');
        if (installBtn) {
            installBtn.style.display = 'block';
            
            installBtn.addEventListener('click', async () => {
                if (!window.deferredPrompt) return;
                
                window.deferredPrompt.prompt();
                const { outcome } = await window.deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    this.showNotification('App installed successfully!', 'success');
                } else {
                    this.showNotification('App installation cancelled', 'info');
                }
                
                window.deferredPrompt = null;
                installBtn.style.display = 'none';
            });
        }
    }

    handleAppInstalled() {
        console.log('PWA was installed');
        const installBtn = document.getElementById('installBtn');
        if (installBtn) {
            installBtn.style.display = 'none';
        }
        this.showNotification('Emergency Triage app installed!', 'success');
    }

    // ============================================
    // Network Status
    // ============================================

    handleOnline() {
        console.log('App is online');
        this.isOffline = false;
        
        const statusDot = document.getElementById('statusDot');
        const connectionStatus = document.getElementById('connectionStatus');
        const offlineWarning = document.getElementById('offlineWarning');
        
        if (statusDot) statusDot.className = 'status-dot';
        if (connectionStatus) connectionStatus.textContent = 'Online';
        if (offlineWarning) offlineWarning.style.display = 'none';
        
        this.showNotification('Connection restored. Syncing data...', 'success');
        
        // Simulate sync
        setTimeout(() => {
            this.updateTime();
            this.showNotification('Data synchronized successfully', 'success');
        }, 2000);
    }

    handleOffline() {
        console.log('App is offline');
        this.isOffline = true;
        
        const statusDot = document.getElementById('statusDot');
        const connectionStatus = document.getElementById('connectionStatus');
        const offlineWarning = document.getElementById('offlineWarning');
        
        if (statusDot) statusDot.className = 'status-dot offline';
        if (connectionStatus) connectionStatus.textContent = 'Offline';
        if (offlineWarning) offlineWarning.style.display = 'flex';
        
        this.showNotification('You are offline. Working in offline mode.', 'warning');
    }

    updateConnectionStatus() {
        if (navigator.onLine) {
            this.handleOnline();
        } else {
            this.handleOffline();
        }
    }
}

// ============================================
// Voice Service Class
// ============================================

class VoiceService {
    constructor(app) {
        this.app = app;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.commands = new Map();
        this.lastCommand = null;
        this.isVoiceEnabled = false;
        this.voiceQueue = [];
        this.isSpeaking = false;
        this.voiceModeActive = false;
        this.defaultVoice = null;
        this.initialize();
    }

    initialize() {
        console.log('Initializing Voice Service...');
        this.checkBrowserSupport();
        if (this.isVoiceEnabled) {
            this.initSpeechRecognition();
            this.loadVoices();
            this.setupDefaultCommands();
        }
    }

    checkBrowserSupport() {
        const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        const hasSpeechSynthesis = 'speechSynthesis' in window;
        
        this.isVoiceEnabled = hasSpeechRecognition && hasSpeechSynthesis;
        
        if (!this.isVoiceEnabled) {
            console.warn('Voice features not supported in this browser');
            this.app.showNotification('Voice features require Chrome or Edge browser', 'warning');
        }
    }

    initSpeechRecognition() {
        if (!this.isVoiceEnabled) return;
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;
        
        this.recognition.onstart = () => {
            console.log('Voice recognition started');
            this.isListening = true;
            this.updateVoiceUI(true);
            this.showVoiceFeedback('Listening...');
        };
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript;
            const confidence = event.results[event.results.length - 1][0].confidence;
            
            console.log(`Voice input: "${transcript}" (${Math.round(confidence * 100)}% confidence)`);
            this.showVoiceFeedback(`Heard: ${transcript}`, true);
            
            this.processVoiceCommand(transcript.toLowerCase().trim());
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.isListening = false;
            this.updateVoiceUI(false);
            this.showVoiceFeedback('Error listening', false);
            
            if (event.error === 'not-allowed') {
                this.app.showNotification('Microphone access denied. Please allow microphone access for voice commands.', 'error');
            }
        };
        
        this.recognition.onend = () => {
            console.log('Voice recognition ended');
            this.isListening = false;
            this.updateVoiceUI(false);
            
            if (this.voiceModeActive) {
                setTimeout(() => this.startListening(), 500);
            }
        };
    }

    loadVoices() {
        setTimeout(() => {
            const voices = this.synthesis.getVoices();
            console.log(`Loaded ${voices.length} speech synthesis voices`);
            
            this.defaultVoice = voices.find(voice => 
                voice.name.includes('Female') || 
                voice.name.includes('Susan') ||
                voice.name.includes('Zira')
            ) || voices[0];
        }, 1000);
    }

    setupDefaultCommands() {
        // Navigation commands
        this.registerCommand('new patient', () => {
            this.speak('Opening new patient form');
            document.getElementById('patientName').focus();
            this.app.scrollToForm();
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
            this.app.setPriority('red');
            this.speak('Set priority to red - immediate attention required');
        });
        
        this.registerCommand('priority yellow', () => {
            this.app.setPriority('yellow');
            this.speak('Set priority to yellow - urgent');
        });
        
        this.registerCommand('priority green', () => {
            this.app.setPriority('green');
            this.speak('Set priority to green - delayed');
        });
        
        this.registerCommand('priority black', () => {
            this.app.setPriority('black');
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
        
        // System commands
        this.registerCommand(['help', 'voice help'], () => {
            this.speak('Showing voice commands');
            this.app.showVoiceHelp();
        });
        
        this.registerCommand(['stop listening', 'stop voice', 'quiet'], () => {
            this.speak('Stopping voice recognition');
            this.stopListening();
            this.voiceModeActive = false;
            this.updateVoiceUI(false);
        });
    }

    registerCommand(trigger, action) {
        if (Array.isArray(trigger)) {
            trigger.forEach(t => this.commands.set(t, action));
        } else {
            this.commands.set(trigger, action);
        }
    }

    toggleVoiceMode() {
        if (!this.isVoiceEnabled) {
            this.app.showNotification('Voice features not available in this browser', 'warning');
            return;
        }
        
        this.voiceModeActive = !this.voiceModeActive;
        
        if (this.voiceModeActive) {
            this.speak('Voice mode activated. Say "help" for commands.');
            this.startListening();
            this.app.showNotification('Voice mode ACTIVE - Say "help" for commands', 'info');
        } else {
            this.stopListening();
            this.speak('Voice mode deactivated');
            this.app.showNotification('Voice mode deactivated', 'info');
        }
        
        this.updateVoiceUI(this.voiceModeActive);
    }

    startListening() {
        if (!this.isVoiceEnabled || !this.recognition) return;
        
        try {
            this.recognition.start();
        } catch (error) {
            console.error('Failed to start recognition:', error);
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
        
        const originalOnResult = this.recognition.onresult;
        const originalCommands = new Map(this.commands);
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            field.value = transcript;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            
            this.speak(`Set ${fieldId.replace(/([A-Z])/g, ' $1').toLowerCase()} to ${transcript}`);
            
            this.recognition.onresult = originalOnResult;
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
        this.lastCommand = transcript;
        
        if (this.commands.has(transcript)) {
            this.commands.get(transcript)();
            return;
        }
        
        for (const [command, action] of this.commands.entries()) {
            if (transcript.includes(command)) {
                action();
                return;
            }
        }
        
        const activeElement = document.activeElement;
        if (activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
            activeElement.value = transcript;
            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            this.speak(`Set to ${transcript}`);
            return;
        }
        
        this.speak(`Command not recognized: ${transcript}. Say "help" for available commands.`);
    }

    speak(text, interrupt = false) {
        if (!this.isVoiceEnabled || !this.synthesis) return;
        
        if (interrupt) {
            this.synthesis.cancel();
        }
        
        if (this.isSpeaking && !interrupt) {
            this.voiceQueue.push(text);
            return;
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        
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

    updateVoiceUI(isActive) {
        const voiceToggleBtn = document.getElementById('voiceToggleBtn');
        const voiceIndicator = document.getElementById('voiceIndicator');
        
        if (voiceToggleBtn) {
            if (isActive) {
                voiceToggleBtn.innerHTML = '🎤🔴';
                voiceToggleBtn.style.color = '#dc2626';
                voiceToggleBtn.style.animation = 'pulse 1.5s infinite';
                voiceToggleBtn.title = 'Voice mode ACTIVE - Click to turn off';
            } else {
                voiceToggleBtn.innerHTML = '🎤';
                voiceToggleBtn.style.color = '';
                voiceToggleBtn.style.animation = '';
                voiceToggleBtn.title = 'Click for voice commands (Ctrl+Shift+V)';
            }
        }
        
        if (voiceIndicator) {
            voiceIndicator.style.display = isActive ? 'flex' : 'none';
        }
    }

    showVoiceFeedback(text, isRecognized = true) {
        const feedback = document.getElementById('voiceFeedback');
        const feedbackText = document.getElementById('feedbackText');
        
        if (feedback && feedbackText) {
            feedbackText.textContent = text;
            feedback.className = `voice-feedback show ${isRecognized ? 'recognized' : 'unrecognized'}`;
            
            setTimeout(() => {
                feedback.classList.remove('show');
            }, 2000);
        }
    }

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

    broadcastEmergency(patient) {
        const message = `Emergency alert! Patient ${patient.name}, priority ${patient.priority.toUpperCase()}, requires immediate attention. Chief complaint: ${patient.chiefComplaint}.`;
        this.speak(message, true);
    }
}

// ============================================
// Initialize Application
// ============================================

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new EmergencyTriageApp();
    window.app = app; // Make available globally for HTML event handlers
});

// Export for debugging
window.EmergencyTriageApp = EmergencyTriageApp;
window.VoiceService = VoiceService;