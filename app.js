// app.js - Upline Emergency Triage PWA v2.0

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
        
        try {
            await this.loadAllData();
            this.setupUI();
            this.setupEventListeners();
            this.setupServiceWorker();
            this.setupVoiceService();
            this.updateConnectionStatus();
            this.updateTime();
            this.setupDarkMode();
            
            // Start periodic updates
            this.startPeriodicUpdates();
            
            // Show welcome
            setTimeout(() => {
                this.showNotification('Emergency Triage System Ready', 'success');
            }, 1000);
            
            this.logEvent('app_started', { timestamp: new Date().toISOString() });
        } catch (error) {
            console.error('App initialization failed:', error);
            this.showNotification('App initialization failed', 'error');
        }
    }

    async loadAllData() {
        try {
            // Load patients
            const savedPatients = localStorage.getItem('upline-patients');
            this.patients = savedPatients ? JSON.parse(savedPatients) : [];
            
            // Load settings
            const savedSettings = localStorage.getItem('triage-settings');
            this.settings = savedSettings ? JSON.parse(savedSettings) : {
                triageProtocol: 'standard',
                autoPriority: true,
                notificationSound: true,
                dataRetention: 30,
                voiceEnabled: 'webkitSpeechRecognition' in window,
                analyticsEnabled: true
            };
            
            // Load user info
            const savedUser = localStorage.getItem('current-user');
            this.currentUser = savedUser ? JSON.parse(savedUser) : {
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
            return true;
        } catch (error) {
            console.error('Failed to load data:', error);
            this.showNotification('Failed to load saved data', 'warning');
            return false;
        }
    }

    setupUI() {
        this.updatePatientCounts();
        this.renderPatients();
        this.updateDashboard();
        this.updateTimeDisplay();
        
        // Initialize form with next ID
        const patientIdField = document.getElementById('patientId');
        if (patientIdField) {
            patientIdField.value = `PAT-${this.nextPatientId}`;
        }
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
        
        // Voice control buttons
        this.setupVoiceControlListeners();
        
        // Control panel buttons
        this.setupControlPanelListeners();
        
        // Keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Search functionality
        this.setupSearch();
    }

    setupVoiceControlListeners() {
        const voiceToggleBtn = document.getElementById('voiceToggleBtn');
        if (voiceToggleBtn) {
            voiceToggleBtn.addEventListener('click', () => this.toggleVoiceMode());
        }
        
        const voiceHelpBtn = document.getElementById('voiceHelpBtn');
        if (voiceHelpBtn) {
            voiceHelpBtn.addEventListener('click', () => this.showVoiceHelp());
        }
        
        // Voice input for form fields
        document.querySelectorAll('.voice-input-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const fieldId = btn.dataset.field;
                if (this.voiceService?.isVoiceEnabled) {
                    this.voiceService.startListeningForField(fieldId);
                } else {
                    this.showNotification('Voice features not available', 'warning');
                }
            });
        });
    }

    setupControlPanelListeners() {
        const buttons = {
            'massCasualtyBtn': () => this.activateMassCasualtyMode(),
            'calculatePriority': () => this.calculateAutoPriority(),
            'exportDataBtn': () => this.exportData(),
            'importDataBtn': () => this.importData(),
            'settingsBtn': () => this.showSettings(),
            'addEmergencyBtn': () => this.addEmergencyPatient(),
            'syncDataBtn': () => this.syncData()
        };
        
        Object.entries(buttons).forEach(([id, handler]) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', handler);
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+V for voice toggle
            if (e.ctrlKey && e.shiftKey && e.key === 'V') {
                e.preventDefault();
                this.toggleVoiceMode();
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

    setupSearch() {
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 Search patients by name or ID...';
        searchInput.className = 'search-input';
        searchInput.style.cssText = `
            padding: 10px 15px;
            margin: 10px 0;
            width: 100%;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
        `;
        
        searchInput.addEventListener('input', (e) => {
            this.filterPatients(e.target.value);
        });
        
        const patientsContainer = document.querySelector('.patients-list-container');
        if (patientsContainer) {
            patientsContainer.insertBefore(searchInput, patientsContainer.firstChild);
        }
    }

    // ============================================
    // Service Worker Methods
    // ============================================

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('✅ Service Worker registered:', registration.scope);
                    
                    // Listen for messages from service worker
                    navigator.serviceWorker.addEventListener('message', event => {
                        const { type, data } = event.data;
                        console.log('Message from SW:', type, data);
                        
                        switch(type) {
                            case 'SYNC_COMPLETE':
                                this.showNotification('Offline data synced', 'success');
                                break;
                            case 'BACKUP_CREATED':
                                console.log('Backup created');
                                break;
                            case 'UPDATE_AVAILABLE':
                                this.showNotification('New version available! Refresh to update.', 'info');
                                break;
                        }
                    });
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                navigator.serviceWorker.controller.postMessage({
                                    type: 'UPDATE_AVAILABLE'
                                });
                            }
                        });
                    });
                })
                .catch(error => {
                    console.error('❌ Service Worker failed:', error);
                });
        }
    }

    async sendMessageToSW(type, data = {}) {
        if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
            return null;
        }
        
        return new Promise((resolve) => {
            const messageChannel = new MessageChannel();
            
            messageChannel.port1.onmessage = (event) => {
                resolve(event.data);
            };
            
            navigator.serviceWorker.controller.postMessage(
                { type, ...data },
                [messageChannel.port2]
            );
            
            // Timeout after 5 seconds
            setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
        });
    }

    // ============================================
    // Voice Service Methods
    // ============================================

    setupVoiceService() {
        if (this.settings.voiceEnabled && 'webkitSpeechRecognition' in window) {
            try {
                this.voiceService = new VoiceService(this);
                console.log('✅ Voice service initialized');
            } catch (error) {
                console.error('Failed to initialize voice service:', error);
            }
        }
    }

    toggleVoiceMode() {
        if (!this.voiceService) {
            this.showNotification('Voice features not available in this browser', 'warning');
            return;
        }
        
        this.voiceService.toggleVoiceMode();
    }

    showVoiceHelp() {
        // Create voice commands panel
        const panel = document.createElement('div');
        panel.className = 'voice-commands-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 2000;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        `;
        
        panel.innerHTML = `
            <h3 style="margin-bottom: 20px; color: #dc2626;">🎤 Voice Commands</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div><strong>New patient</strong> - Start new assessment</div>
                <div><strong>Priority red</strong> - Set immediate priority</div>
                <div><strong>Priority yellow</strong> - Set urgent priority</div>
                <div><strong>Priority green</strong> - Set delayed priority</div>
                <div><strong>Name [name]</strong> - Enter patient name</div>
                <div><strong>Age [number]</strong> - Enter patient age</div>
                <div><strong>Submit</strong> - Save patient</div>
                <div><strong>Show queue</strong> - View patient list</div>
                <div><strong>Show dashboard</strong> - Return to dashboard</div>
                <div><strong>Stop listening</strong> - Turn off voice</div>
            </div>
            <button onclick="this.closest('.voice-commands-panel').remove()" 
                style="margin-top: 20px; padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; width: 100%;">
                Close
            </button>
        `;
        
        document.body.appendChild(panel);
        
        // Close on background click
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1999;
        `;
        document.body.appendChild(overlay);
        
        overlay.addEventListener('click', () => {
            panel.remove();
            overlay.remove();
        });
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
        if (!patientData.patientName?.trim() || !patientData.age || !patientData.gender || !patientData.chiefComplaint?.trim() || !patientData.triagePriority) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        // Validate age
        const age = parseInt(patientData.age);
        if (isNaN(age) || age < 0 || age > 150) {
            this.showNotification('Please enter a valid age (0-150)', 'error');
            return;
        }
        
        try {
            // Calculate priority if auto-priority is enabled
            if (this.settings.autoPriority && !patientData.triagePriority) {
                patientData.triagePriority = this.calculatePriorityFromVitals(patientData);
            }
            
            // Create patient object
            const patient = {
                id: patientData.patientId || `PAT-${this.nextPatientId}`,
                name: patientData.patientName.trim(),
                age: parseInt(patientData.age),
                gender: patientData.gender,
                vitalSigns: {
                    heartRate: patientData.heartRate || 'Not recorded',
                    bloodPressure: patientData.bloodPressureSystolic || 'Not recorded',
                    respiratoryRate: patientData.respiratoryRate || 'Not recorded',
                    oxygenSaturation: patientData.oxygenSaturation || 'Not recorded',
                    temperature: patientData.temperature || 'Not recorded'
                },
                chiefComplaint: patientData.chiefComplaint.trim(),
                notes: patientData.notes?.trim() || '',
                priority: patientData.triagePriority,
                timestamp: new Date().toISOString(),
                arrivalTime: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                status: 'waiting',
                assignedTo: null,
                location: await this.getGeolocation(),
                deviceId: this.currentUser.id,
                syncStatus: navigator.onLine ? 'synced' : 'pending'
            };
            
            // Add to patients array
            this.patients.unshift(patient);
            this.nextPatientId++;
            
            // Save to storage
            await this.saveToStorage('upline-patients', this.patients);
            
            // Save to service worker IndexedDB
            await this.sendMessageToSW('SAVE_PATIENT', { patient });
            
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
            if (this.voiceService?.voiceModeActive) {
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
            
            this.logEvent('patient_added', { patientId: patient.id, priority: patient.priority });
            
        } catch (error) {
            console.error('Failed to save patient:', error);
            this.showNotification('Failed to save patient', 'error');
        }
    }

    calculatePriorityFromVitals(patientData) {
        let score = 0;
        
        // Heart rate scoring (bpm)
        const hr = parseInt(patientData.heartRate) || 80;
        if (hr < 50 || hr > 120) score += 2;
        if (hr < 40 || hr > 140) score += 3;
        
        // Blood pressure scoring (systolic)
        const bp = parseInt(patientData.bloodPressureSystolic) || 120;
        if (bp < 90 || bp > 160) score += 2;
        if (bp < 70 || bp > 180) score += 3;
        
        // Oxygen saturation scoring (%)
        const spo2 = parseInt(patientData.oxygenSaturation) || 98;
        if (spo2 < 94) score += 2;
        if (spo2 < 90) score += 3;
        
        // Respiratory rate scoring (rpm)
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
            heartRate: document.getElementById('heartRate')?.value || '',
            bloodPressureSystolic: document.getElementById('bloodPressureSystolic')?.value || '',
            oxygenSaturation: document.getElementById('oxygenSaturation')?.value || '',
            respiratoryRate: document.getElementById('respiratoryRate')?.value || ''
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
        const emergencyNames = ['John Doe', 'Jane Smith', 'Robert Johnson', 'Maria Garcia'];
        const complaints = ['Chest pain', 'Difficulty breathing', 'Trauma', 'Unconscious'];
        
        document.getElementById('patientId').value = `EMG-${this.nextPatientId}`;
        document.getElementById('patientName').value = emergencyNames[Math.floor(Math.random() * emergencyNames.length)];
        document.getElementById('age').value = Math.floor(Math.random() * 70) + 20;
        document.getElementById('gender').value = ["male", "female"][Math.floor(Math.random() * 2)];
        document.getElementById('chiefComplaint').value = complaints[Math.floor(Math.random() * complaints.length)];
        document.getElementById('triagePriority').value = "red";
        document.getElementById('notes').value = "Emergency entry - requires immediate attention";
        
        // Focus on form
        document.querySelector('.patient-form-container').scrollIntoView({ behavior: 'smooth' });
        document.getElementById('patientName').focus();
    }

    // ============================================
    // Patient List Management
    // ============================================

    renderPatients(filteredPatients = null) {
        const patientsList = document.getElementById('patientsList');
        if (!patientsList) return;
        
        const patientsToRender = filteredPatients || this.patients;
        
        if (patientsToRender.length === 0) {
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
        const sortedPatients = [...patientsToRender].sort((a, b) => {
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

    filterPatients(query) {
        if (!query.trim()) {
            this.renderPatients();
            return;
        }
        
        const filtered = this.patients.filter(patient => 
            patient.name.toLowerCase().includes(query.toLowerCase()) ||
            patient.id.toLowerCase().includes(query.toLowerCase()) ||
            patient.chiefComplaint.toLowerCase().includes(query.toLowerCase())
        );
        
        this.renderPatients(filtered);
        
        // Update count
        const countElement = document.getElementById('filteredCount');
        if (countElement) {
            countElement.textContent = filtered.length === this.patients.length ? 
                '' : ` (${filtered.length} filtered)`;
        }
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
        if (patientIndex === -1) {
            this.showNotification('Patient not found', 'error');
            return;
        }
        
        const patient = this.patients[patientIndex];
        this.showNotification(`Treating patient: ${patient.name}`, 'success');
        
        // Remove patient
        this.patients.splice(patientIndex, 1);
        
        // Save to storage
        this.saveToStorage('upline-patients', this.patients);
        this.renderPatients();
        this.updatePatientCounts();
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate([50, 50, 50]);
        }
        
        this.logEvent('patient_treated', { patientId });
    }

    showPatientDetails(patientId) {
        const patient = this.patients.find(p => p.id === patientId);
        if (!patient) return;
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'patient-details-modal';
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
        
        const priorityColors = {
            red: '#dc2626',
            yellow: '#ca8a04',
            green: '#16a34a',
            black: '#1f2937'
        };
        
        modal.innerHTML = `
            <div style="background:white;border-radius:12px;padding:30px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: #dc2626;">Patient Details</h3>
                    <button onclick="this.closest('.patient-details-modal').remove()" 
                        style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">
                        ×
                    </button>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div><strong>ID:</strong> ${patient.id}</div>
                    <div><strong>Name:</strong> ${patient.name}</div>
                    <div><strong>Age:</strong> ${patient.age}</div>
                    <div><strong>Gender:</strong> ${patient.gender}</div>
                    <div><strong>Priority:</strong> 
                        <span style="color:${priorityColors[patient.priority]}; font-weight: bold;">
                            ${patient.priority.toUpperCase()}
                        </span>
                    </div>
                    <div><strong>Status:</strong> ${patient.status}</div>
                </div>
                
                <div style="margin-bottom:20px;">
                    <strong>Chief Complaint:</strong><br>
                    ${patient.chiefComplaint}
                </div>
                
                <div style="margin-bottom:20px;">
                    <strong>Vital Signs:</strong><br>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;">
                        <div>HR: ${patient.vitalSigns.heartRate}</div>
                        <div>BP: ${patient.vitalSigns.bloodPressure}</div>
                        <div>RR: ${patient.vitalSigns.respiratoryRate}</div>
                        <div>SpO₂: ${patient.vitalSigns.oxygenSaturation}</div>
                        <div>Temp: ${patient.vitalSigns.temperature}</div>
                    </div>
                </div>
                
                ${patient.notes ? `
                <div style="margin-bottom:20px;">
                    <strong>Notes:</strong><br>
                    ${patient.notes}
                </div>
                ` : ''}
                
                <div style="margin-bottom:20px;">
                    <strong>Arrival Time:</strong> ${new Date(patient.timestamp).toLocaleString()}
                </div>
                
                <button onclick="this.closest('.patient-details-modal').remove()" 
                    style="background:#dc2626;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;width:100%;font-weight:600;">
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
            'statsBlack': stats.black,
            'longestWait': `${stats.longestWait}m`
        };
        
        Object.entries(statElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
        
        // Update charts
        this.updateCharts(stats);
    }

    calculateStatistics() {
        const now = Date.now();
        const waitingTimes = this.patients
            .filter(p => p.timestamp)
            .map(p => Math.round((now - new Date(p.timestamp).getTime()) / 60000)); // minutes
        
        return {
            total: this.patients.length,
            red: this.patients.filter(p => p.priority === 'red').length,
            yellow: this.patients.filter(p => p.priority === 'yellow').length,
            green: this.patients.filter(p => p.priority === 'green').length,
            black: this.patients.filter(p => p.priority === 'black').length,
            avgWaitTime: waitingTimes.length > 0 ? 
                Math.round(waitingTimes.reduce((a, b) => a + b) / waitingTimes.length) : 0,
            longestWait: waitingTimes.length > 0 ? Math.max(...waitingTimes) : 0
        };
    }

    updateCharts(stats) {
        const canvas = document.getElementById('triageChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw bar chart
        const colors = ['#dc2626', '#ca8a04', '#16a34a', '#1f2937'];
        const priorities = ['red', 'yellow', 'green', 'black'];
        const maxCount = Math.max(stats.red, stats.yellow, stats.green, stats.black, 1);
        const barWidth = 40;
        const spacing = 50;
        
        priorities.forEach((priority, index) => {
            const count = stats[priority];
            const height = (count / maxCount) * 100;
            const x = index * spacing + 10;
            const y = 150 - height;
            
            // Draw bar
            ctx.fillStyle = colors[index];
            ctx.fillRect(x, y, barWidth, height);
            
            // Draw count
            ctx.fillStyle = '#374151';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(count.toString(), x + barWidth/2, y - 5);
            
            // Draw label
            ctx.fillText(priority.toUpperCase(), x + barWidth/2, 170);
        });
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
        
        // Play emergency sound
        this.playEmergencySound();
    }

    assignToSelf(patientId) {
        const patient = this.patients.find(p => p.id === patientId);
        if (!patient) return;
        
        patient.assignedTo = this.currentUser.name;
        patient.status = 'in_progress';
        
        this.saveToStorage('upline-patients', this.patients);
        this.renderPatients();
        
        this.showNotification(`Assigned ${patient.name} to yourself`, 'success');
        
        // Reset alert
        this.resetEmergencyAlert();
    }

    resetEmergencyAlert() {
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
            alertElement.style.animation = '';
            
            // Reattach event listener
            const addEmergencyBtn = document.getElementById('addEmergencyBtn');
            if (addEmergencyBtn) {
                addEmergencyBtn.addEventListener('click', () => this.addEmergencyPatient());
            }
        }
    }

    activateMassCasualtyMode() {
        this.settings.triageProtocol = 'mass_casualty';
        this.saveToStorage('triage-settings', this.settings);
        
        this.showNotification('Mass Casualty Mode Activated', 'warning');
        
        // Add quick triage interface
        const formContainer = document.querySelector('.patient-form-container');
        if (formContainer && !formContainer.querySelector('.quick-triage')) {
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
            
            // Add styles
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
                    font-size: 14px;
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
        const emergencyNames = ['Unknown Male', 'Unknown Female', 'Child', 'Elderly'];
        
        const patient = {
            id: `MCI-${Date.now()}`,
            name: `${emergencyNames[Math.floor(Math.random() * emergencyNames.length)]}`,
            age: Math.floor(Math.random() * 70) + 10,
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
    // Data Management
    // ============================================

    async exportData() {
        try {
            const data = {
                patients: this.patients,
                settings: this.settings,
                user: this.currentUser,
                metadata: {
                    exportedAt: new Date().toISOString(),
                    totalPatients: this.patients.length,
                    appVersion: '2.0.0'
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
            this.logEvent('data_exported', { patientCount: this.patients.length });
        } catch (error) {
            console.error('Export failed:', error);
            this.showNotification('Export failed', 'error');
        }
    }

    async importData() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve(false);
                    return;
                }
                
                const reader = new FileReader();
                
                reader.onload = async (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        
                        if (data.patients && Array.isArray(data.patients)) {
                            // Confirm import
                            if (!confirm(`Import ${data.patients.length} patients?`)) {
                                resolve(false);
                                return;
                            }
                            
                            // Merge patients
                            const existingIds = new Set(this.patients.map(p => p.id));
                            const newPatients = data.patients.filter(p => !existingIds.has(p.id));
                            
                            this.patients = [...newPatients, ...this.patients];
                            
                            // Update settings if present
                            if (data.settings) {
                                this.settings = { ...this.settings, ...data.settings };
                                await this.saveToStorage('triage-settings', this.settings);
                            }
                            
                            await this.saveToStorage('upline-patients', this.patients);
                            
                            this.updatePatientCounts();
                            this.renderPatients();
                            
                            this.showNotification(`Imported ${newPatients.length} patients`, 'success');
                            this.logEvent('data_imported', { importedCount: newPatients.length });
                        } else {
                            throw new Error('Invalid data format');
                        }
                    } catch (error) {
                        console.error('Import error:', error);
                        this.showNotification('Failed to import: Invalid file format', 'error');
                    }
                    resolve(true);
                };
                
                reader.onerror = () => {
                    this.showNotification('Failed to read file', 'error');
                    resolve(false);
                };
                
                reader.readAsText(file);
            };
            
            input.click();
        });
    }

    async syncData() {
        if (!navigator.onLine) {
            this.showNotification('Cannot sync while offline', 'warning');
            return;
        }
        
        this.showNotification('Syncing data...', 'info');
        
        try {
            // Get data from service worker IndexedDB
            const response = await this.sendMessageToSW('GET_PENDING_DATA');
            
            if (response.success && response.data?.length > 0) {
                // Merge with local data
                this.patients = [...response.data, ...this.patients];
                await this.saveToStorage('upline-patients', this.patients);
                
                // Clear pending data
                await this.sendMessageToSW('CLEAR_PENDING_DATA');
                
                this.renderPatients();
                this.updatePatientCounts();
                
                this.showNotification(`Synced ${response.data.length} items`, 'success');
            } else {
                this.showNotification('No pending data to sync', 'info');
            }
        } catch (error) {
            console.error('Sync failed:', error);
            this.showNotification('Sync failed', 'error');
        }
    }

    async cleanupOldData() {
        const retentionDays = this.settings.dataRetention || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        const initialCount = this.patients.length;
        this.patients = this.patients.filter(patient => {
            const patientDate = new Date(patient.timestamp);
            return patientDate > cutoffDate;
        });
        
        const removedCount = initialCount - this.patients.length;
        if (removedCount > 0) {
            await this.saveToStorage('upline-patients', this.patients);
            this.renderPatients();
            this.updatePatientCounts();
            
            console.log(`Cleaned up ${removedCount} old patients`);
            this.logEvent('data_cleaned', { removedCount });
        }
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
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #1f2937;">⚙️ System Settings</h2>
                    <button onclick="this.closest('.settings-modal').remove()" 
                        style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">
                        ×
                    </button>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Triage Protocol</label>
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
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <input type="checkbox" id="analyticsEnabled" ${this.settings.analyticsEnabled ? 'checked' : ''}>
                        Enable Analytics
                    </label>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Data Retention (days)</label>
                    <input type="number" id="dataRetention" value="${this.settings.dataRetention}" 
                        min="1" max="365" style="width:100%;padding:10px;border-radius:8px;border:2px solid #e5e7eb;">
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">User Role</label>
                    <select id="userRole" style="width:100%;padding:10px;border-radius:8px;border:2px solid #e5e7eb;">
                        <option value="paramedic" ${this.currentUser.role === 'paramedic' ? 'selected' : ''}>Paramedic</option>
                        <option value="nurse" ${this.currentUser.role === 'nurse' ? 'selected' : ''}>Nurse</option>
                        <option value="doctor" ${this.currentUser.role === 'doctor' ? 'selected' : ''}>Doctor</option>
                        <option value="coordinator" ${this.currentUser.role === 'coordinator' ? 'selected' : ''}>Coordinator</option>
                    </select>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">User Name</label>
                    <input type="text" id="userName" value="${this.currentUser.name}" 
                        style="width:100%;padding:10px;border-radius:8px;border:2px solid #e5e7eb;">
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
        try {
            this.settings = {
                triageProtocol: document.getElementById('triageProtocol').value,
                autoPriority: document.getElementById('autoPriority').checked,
                notificationSound: document.getElementById('notificationSound').checked,
                voiceEnabled: document.getElementById('voiceEnabled').checked,
                analyticsEnabled: document.getElementById('analyticsEnabled').checked,
                dataRetention: parseInt(document.getElementById('dataRetention').value) || 30
            };
            
            this.currentUser = {
                ...this.currentUser,
                name: document.getElementById('userName').value || 'Emergency Responder',
                role: document.getElementById('userRole').value
            };
            
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
            this.logEvent('settings_updated', this.settings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('Failed to save settings', 'error');
        }
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
            // Try to clear some space if storage is full
            if (error.name === 'QuotaExceededError') {
                await this.cleanupOldData();
                try {
                    localStorage.setItem(key, JSON.stringify(data));
                    return true;
                } catch (retryError) {
                    this.showNotification('Storage full. Please export and clear data.', 'error');
                }
            }
            return false;
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-text">${message}</span>
            <button class="notification-close">×</button>
        `;
        
        // Add styles
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    padding: 15px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    min-width: 300px;
                    max-width: 400px;
                    z-index: 10000;
                    animation: slideIn 0.3s ease;
                    border-left: 4px solid;
                }
                .notification-info { border-left-color: #3b82f6; }
                .notification-success { border-left-color: #10b981; }
                .notification-warning { border-left-color: #f59e0b; }
                .notification-error { border-left-color: #ef4444; }
                .notification-close {
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: #6b7280;
                    margin-left: 10px;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
        
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted' && this.settings.notificationSound) {
            new Notification('Emergency Triage', {
                body: message,
                icon: '/icon-192.png'
            });
        }
        
        // Play sound if enabled
        if (this.settings.notificationSound) {
            this.playNotificationSound();
        }
    }

    playNotificationSound() {
        try {
            // Create audio context for notification sound
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
            console.error('Error playing sound:', error);
        }
    }

    playEmergencySound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Emergency siren pattern
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.3);
            oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.6);
            
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 1);
        } catch (error) {
            console.error('Error playing emergency sound:', error);
        }
    }

    getTimeAgo(timestamp) {
        if (!timestamp) return 'Unknown time';
        
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
            timeElement.textContent = now.toLocaleDateString() + ' ' + 
                                    now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        
        const syncTimeElement = document.getElementById('lastSyncTime');
        if (syncTimeElement) {
            syncTimeElement.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
    }

    updateTimeDisplay() {
        this.updateTime();
        setInterval(() => this.updateTime(), 60000);
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
                // Scroll to form
                document.querySelector('.patient-form-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    async getGeolocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ latitude: null, longitude: null, accuracy: null });
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString()
                    });
                },
                (error) => {
                    console.warn('Geolocation failed:', error);
                    resolve({
                        latitude: null,
                        longitude: null,
                        accuracy: null,
                        error: error.message
                    });
                },
                {
                    enableHighAccuracy: false,
                    timeout: 5000,
                    maximumAge: 60000
                }
            );
        });
    }

    logEvent(eventType, data) {
        if (!this.settings.analyticsEnabled) return;
        
        const event = {
            type: eventType,
            data,
            timestamp: new Date().toISOString(),
            user: this.currentUser.id,
            online: navigator.onLine
        };
        
        // Save to localStorage for now (in production, send to server)
        try {
            const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
            logs.push(event);
            if (logs.length > 1000) logs.shift(); // Keep only last 1000 logs
            localStorage.setItem('app_logs', JSON.stringify(logs));
        } catch (error) {
            console.error('Failed to log event:', error);
        }
        
        console.log(`📊 Event: ${eventType}`, data);
    }

    setupDarkMode() {
        // Check for dark mode preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
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
        
        // Cleanup old data daily
        setInterval(() => this.cleanupOldData(), 24 * 60 * 60 * 1000);
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
        this.logEvent('app_installed');
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
        this.syncData();
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        this.checkBrowserSupport();
        if (this.isVoiceEnabled) {
            this.initSpeechRecognition();
            this.loadVoices();
            this.setupDefaultCommands();
            console.log('✅ Voice service initialized');
        } else {
            console.warn('Voice features not supported');
        }
    }

    checkBrowserSupport() {
        const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        const hasSpeechSynthesis = 'speechSynthesis' in window;
        
        this.isVoiceEnabled = hasSpeechRecognition && hasSpeechSynthesis;
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
            this.showVoiceFeedback('🎤 Listening...');
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
            this.showVoiceFeedback('❌ Error listening', false);
            
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
        // Load available voices
        const loadVoices = () => {
            const voices = this.synthesis.getVoices();
            if (voices.length > 0) {
                this.defaultVoice = voices.find(voice => 
                    voice.lang.includes('en') && 
                    (voice.name.includes('Female') || voice.name.includes('Susan'))
                ) || voices[0];
            }
        };
        
        loadVoices();
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = loadVoices;
        }
    }

    setupDefaultCommands() {
        // Navigation commands
        this.registerCommand('new patient', () => {
            this.speak('Opening new patient form');
            document.getElementById('patientName')?.focus();
        });
        
        this.registerCommand('show queue', () => {
            this.speak('Showing patient queue');
            document.querySelector('.patients-list-container')?.scrollIntoView({ behavior: 'smooth' });
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
        this.registerCommand('name', () => {
            this.speak('Ready for patient name');
            document.getElementById('patientName')?.focus();
        });
        
        this.registerCommand('age', () => {
            this.speak('Ready for patient age');
            document.getElementById('age')?.focus();
        });
        
        this.registerCommand('complaint', () => {
            this.speak('Ready for chief complaint');
            document.getElementById('chiefComplaint')?.focus();
        });
        
        // System commands
        this.registerCommand('help', () => {
            this.speak('Showing voice commands');
            this.app.showVoiceHelp();
        });
        
        this.registerCommand('stop listening', () => {
            this.speak('Stopping voice recognition');
            this.stopListening();
            this.voiceModeActive = false;
            this.updateVoiceUI(false);
        });
        
        this.registerCommand('submit', () => {
            this.speak('Submitting form');
            document.getElementById('patientForm')?.dispatchEvent(new Event('submit'));
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
            this.startListening();
            this.speak('Voice mode activated. Say "help" for commands.');
            this.app.showNotification('Voice mode ACTIVE', 'info');
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
        
        // Check exact matches first
        if (this.commands.has(transcript)) {
            this.commands.get(transcript)();
            return;
        }
        
        // Check partial matches
        for (const [command, action] of this.commands.entries()) {
            if (transcript.includes(command)) {
                action();
                return;
            }
        }
        
        // Handle direct input for focused field
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
                voiceToggleBtn.title = 'Voice mode ACTIVE - Click to turn off';
            } else {
                voiceToggleBtn.innerHTML = '🎤';
                voiceToggleBtn.style.color = '';
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
    
    // Add global error handler
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        if (app) {
            app.showNotification('An error occurred', 'error');
        }
    });
    
    // Add unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        if (app) {
            app.showNotification('An unexpected error occurred', 'error');
        }
    });
});
           
