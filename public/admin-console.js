// Admin Console JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // Password will be entered by the user (no hardcoded password)
    let adminPassword = '';
    
    // DOM elements
    const loginSection = document.getElementById('login-section');
    const adminSection = document.getElementById('admin-section');
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const saveSuccess = document.getElementById('saveSuccess');
    const saveError = document.getElementById('saveError');
    const jsonEditor = document.getElementById('jsonEditor');
    const addItemBtn = document.getElementById('addItemBtn');
    const addInjectBtn = document.getElementById('addInjectBtn');
    
    // Tab elements
    const tabButtons = document.querySelectorAll('.nav-link');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Form input elements for general settings
    const roundCountInput = document.getElementById('roundCount');
    const roundDurationInput = document.getElementById('roundDuration');
    const sessionDurationInput = document.getElementById('sessionDuration');
    const gridSizeInput = document.getElementById('gridSize');
    const maxStepsPerRoundInput = document.getElementById('maxStepsPerRound');
    const maxConcurrentGroupsInput = document.getElementById('maxConcurrentGroups');
    const testModeInput = document.getElementById('testMode');
    const pickupSingleQtyInput = document.getElementById('pickupSingleQty');
    const pickupChoiceQtyInput = document.getElementById('pickupChoiceQty');
    const injectEventNullPercentageInput = document.getElementById('injectEventNullPercentage');
    const injectRandomPercentageInput = document.getElementById('injectRandomPercentage');
    
    // Containers for dynamic content
    const itemsContainer = document.getElementById('itemsContainer');
    const textTemplatesContainer = document.getElementById('textTemplatesContainer');
    const injectStoriesContainer = document.getElementById('injectStoriesContainer');
    
    // Global variable to store the current configuration
    let currentConfig = null;
    
    // Handle tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Add active class to clicked tab and show corresponding pane
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // Skip login and go directly to admin section
    loginSection.style.display = 'none';
    adminSection.style.display = 'block';
    loadConfig();
    
    // Previous login form listener (no longer needed but kept for reference)
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        // Auto-login already handled above
    });
    
    // Handle logout - modified to reload the page
    logoutBtn.addEventListener('click', () => {
        window.location.reload();
    });
    
    // Load configuration from server
    async function loadConfig() {
        try {
            const response = await fetch('/api/game-config');
            if (!response.ok) {
                throw new Error('Failed to load configuration');
            }
            
            currentConfig = await response.json();
            
            // Populate form fields with config values
            populateFormFields();
            
            // Show success alert briefly then hide it
            saveSuccess.style.display = 'none';
            saveError.style.display = 'none';
        } catch (error) {
            console.error('Error loading configuration:', error);
            saveError.textContent = `Error loading configuration: ${error.message}`;
            saveError.style.display = 'block';
        }
    }
    
    // Populate all form fields with values from currentConfig
    function populateFormFields() {
        // Populate general settings
        roundCountInput.value = currentConfig.ROUND_COUNT;
        roundDurationInput.value = currentConfig.ROUND_DURATION_SEC;
        sessionDurationInput.value = currentConfig.SESSION_DURATION_SEC;
        gridSizeInput.value = currentConfig.GRID_SIZE;
        maxStepsPerRoundInput.value = currentConfig.MAX_STEPS_PER_ROUND;
        maxConcurrentGroupsInput.value = currentConfig.MAX_CONCURRENT_GROUPS;
        testModeInput.checked = currentConfig.TEST_MODE;
        pickupSingleQtyInput.value = currentConfig.PICKUP_SINGLE_QTY;
        pickupChoiceQtyInput.value = currentConfig.PICKUP_CHOICE_QTY;
        injectEventNullPercentageInput.value = currentConfig.INJECT_EVENT_NULL_PERCENTAGE;
        injectRandomPercentageInput.value = currentConfig.INJECT_RANDOM_PERCENTAGE;
        
        // Populate items
        populateItems();
        
        // Populate text templates
        populateTextTemplates();
        
        // Populate inject stories
        populateInjectStories();
        
        // Update raw JSON editor
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    }
    
    // Populate items section
    function populateItems() {
        itemsContainer.innerHTML = '';
        
        currentConfig.ITEMS.forEach((item, index) => {
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';
            itemCard.innerHTML = `
                <div class="row">
                    <div class="col-md-3">
                        <div class="mb-3">
                            <label class="form-label">Item Code</label>
                            <input type="text" class="form-control item-code" value="${item.code}" data-index="${index}">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="mb-3">
                            <label class="form-label">Item Name</label>
                            <input type="text" class="form-control item-name" value="${item.name}" data-index="${index}">
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="mb-3">
                            <label class="form-label">Emoji</label>
                            <input type="text" class="form-control item-emoji" value="${item.emoji}" data-index="${index}">
                        </div>
                    </div>
                    <div class="col-md-2 d-flex align-items-end">
                        <button class="btn btn-danger delete-item-btn mb-3" data-index="${index}">Delete</button>
                    </div>
                </div>
            `;
            itemsContainer.appendChild(itemCard);
        });
        
        // Add event listeners to item inputs
        document.querySelectorAll('.item-code').forEach(input => {
            input.addEventListener('change', updateItem);
        });
        
        document.querySelectorAll('.item-name').forEach(input => {
            input.addEventListener('change', updateItem);
        });
        
        document.querySelectorAll('.item-emoji').forEach(input => {
            input.addEventListener('change', updateItem);
        });
        
        document.querySelectorAll('.delete-item-btn').forEach(button => {
            button.addEventListener('click', deleteItem);
        });
    }
    
    // Update item when input changes
    function updateItem(e) {
        const index = parseInt(e.target.dataset.index);
        const fieldClass = e.target.className.split(' ')[1]; // Get the second class (item-code, item-name, item-emoji)
        const field = fieldClass.split('-')[1]; // Get the field name (code, name, emoji)
        
        // Update the item in the currentConfig
        if (field === 'code') {
            currentConfig.ITEMS[index].code = e.target.value;
        } else if (field === 'name') {
            currentConfig.ITEMS[index].name = e.target.value;
        } else if (field === 'emoji') {
            currentConfig.ITEMS[index].emoji = e.target.value;
        }
        
        // Update the raw JSON editor
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    }
    
    // Delete item
    function deleteItem(e) {
        const index = parseInt(e.target.dataset.index);
        
        // Remove the item from the currentConfig
        currentConfig.ITEMS.splice(index, 1);
        
        // Re-render the items
        populateItems();
        
        // Update the raw JSON editor
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    }
    
    // Add a new item
    addItemBtn.addEventListener('click', () => {
        // Add a new item to the currentConfig
        currentConfig.ITEMS.push({ code: 'NEW', name: 'New Item', emoji: '🆕' });
        
        // Re-render the items
        populateItems();
        
        // Update the raw JSON editor
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    // Populate text templates section
    function populateTextTemplates() {
        textTemplatesContainer.innerHTML = '';
        
        // Create a form for each text template
        Object.entries(currentConfig.TEXT_TEMPLATES).forEach(([key, value]) => {
            const templateCard = document.createElement('div');
            templateCard.className = 'item-card';
            templateCard.innerHTML = `
                <div class="mb-3">
                    <label class="form-label">${key}</label>
                    <input type="text" class="form-control text-template" value="${value}" data-key="${key}">
                </div>
            `;
            textTemplatesContainer.appendChild(templateCard);
        });
        
        // Add event listeners to text template inputs
        document.querySelectorAll('.text-template').forEach(input => {
            input.addEventListener('change', updateTextTemplate);
        });
    }
    
    // Update text template when input changes
    function updateTextTemplate(e) {
        const key = e.target.dataset.key;
        
        // Update the text template in the currentConfig
        currentConfig.TEXT_TEMPLATES[key] = e.target.value;
        
        // Update the raw JSON editor
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    }
    
    // Populate inject stories section
    function populateInjectStories() {
        injectStoriesContainer.innerHTML = '';
        
        currentConfig.INJECT_STORIES.forEach((story, index) => {
            const storyCard = document.createElement('div');
            storyCard.className = 'item-card';
            storyCard.innerHTML = `
                <div class="row">
                    <div class="col-md-10">
                        <div class="mb-3">
                            <label class="form-label">Story ${index + 1}</label>
                            <input type="text" class="form-control inject-story" value="${story}" data-index="${index}">
                        </div>
                    </div>
                    <div class="col-md-2 d-flex align-items-end">
                        <button class="btn btn-danger delete-story-btn mb-3" data-index="${index}">Delete</button>
                    </div>
                </div>
            `;
            injectStoriesContainer.appendChild(storyCard);
        });
        
        // Add event listeners to inject story inputs
        document.querySelectorAll('.inject-story').forEach(input => {
            input.addEventListener('change', updateInjectStory);
        });
        
        document.querySelectorAll('.delete-story-btn').forEach(button => {
            button.addEventListener('click', deleteInjectStory);
        });
    }
    
    // Update inject story when input changes
    function updateInjectStory(e) {
        const index = parseInt(e.target.dataset.index);
        
        // Update the inject story in the currentConfig
        currentConfig.INJECT_STORIES[index] = e.target.value;
        
        // Update the raw JSON editor
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    }
    
    // Delete inject story
    function deleteInjectStory(e) {
        const index = parseInt(e.target.dataset.index);
        
        // Remove the inject story from the currentConfig
        currentConfig.INJECT_STORIES.splice(index, 1);
        
        // Re-render the inject stories
        populateInjectStories();
        
        // Update the raw JSON editor
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    }
    
    // Add a new inject story
    addInjectBtn.addEventListener('click', () => {
        // Add a new inject story to the currentConfig
        currentConfig.INJECT_STORIES.push('New inject event story');
        
        // Re-render the inject stories
        populateInjectStories();
        
        // Update the raw JSON editor
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    // Handle changes in general settings inputs
    // These are simple one-to-one mappings to config properties
    roundCountInput.addEventListener('change', () => {
        currentConfig.ROUND_COUNT = parseInt(roundCountInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    roundDurationInput.addEventListener('change', () => {
        currentConfig.ROUND_DURATION_SEC = parseInt(roundDurationInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    sessionDurationInput.addEventListener('change', () => {
        currentConfig.SESSION_DURATION_SEC = parseInt(sessionDurationInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    gridSizeInput.addEventListener('change', () => {
        currentConfig.GRID_SIZE = parseInt(gridSizeInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    maxStepsPerRoundInput.addEventListener('change', () => {
        currentConfig.MAX_STEPS_PER_ROUND = parseInt(maxStepsPerRoundInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    maxConcurrentGroupsInput.addEventListener('change', () => {
        currentConfig.MAX_CONCURRENT_GROUPS = parseInt(maxConcurrentGroupsInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    testModeInput.addEventListener('change', () => {
        currentConfig.TEST_MODE = testModeInput.checked;
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    pickupSingleQtyInput.addEventListener('change', () => {
        currentConfig.PICKUP_SINGLE_QTY = parseInt(pickupSingleQtyInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    pickupChoiceQtyInput.addEventListener('change', () => {
        currentConfig.PICKUP_CHOICE_QTY = parseInt(pickupChoiceQtyInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    injectEventNullPercentageInput.addEventListener('change', () => {
        currentConfig.INJECT_EVENT_NULL_PERCENTAGE = parseInt(injectEventNullPercentageInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    injectRandomPercentageInput.addEventListener('change', () => {
        currentConfig.INJECT_RANDOM_PERCENTAGE = parseInt(injectRandomPercentageInput.value);
        jsonEditor.value = JSON.stringify(currentConfig, null, 2);
    });
    
    // Handle changes in raw JSON editor
    jsonEditor.addEventListener('change', () => {
        try {
            // Parse the JSON to validate it
            currentConfig = JSON.parse(jsonEditor.value);
            
            // Update form fields with new values
            populateFormFields();
            
            // Clear error message if it was previously shown
            saveError.style.display = 'none';
        } catch (error) {
            console.error('Error parsing JSON:', error);
            saveError.textContent = `Error in JSON: ${error.message}`;
            saveError.style.display = 'block';
        }
    });
    
    // Handle save button click
    saveBtn.addEventListener('click', async () => {
        try {
            // Send the updated configuration to the server
            const response = await fetch('/api/save-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(currentConfig)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to save configuration');
            }
            
            // Show success message
            saveSuccess.style.display = 'block';
            saveError.style.display = 'none';
            
            // Hide success message after 3 seconds
            setTimeout(() => {
                saveSuccess.style.display = 'none';
            }, 3000);
        } catch (error) {
            console.error('Error saving configuration:', error);
            saveError.textContent = `Error saving configuration: ${error.message}`;
            saveError.style.display = 'block';
            saveSuccess.style.display = 'none';
        }
    });
    
    // Handle reset button click
    resetBtn.addEventListener('click', () => {
        // Reload the configuration from the server
        loadConfig();
    });
}); 