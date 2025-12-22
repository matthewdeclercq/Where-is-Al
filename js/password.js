// Password gate logic for Where Is Al
(function() {
    'use strict';

    const AUTH_ENDPOINT = (window.Config && window.Config.workerUrl) 
        ? window.Config.workerUrl + 'auth' 
        : 'https://where-is-al.matthew-declercq.workers.dev/auth';
    const MAIN_PAGE = 'main.html';
    const MAX_ATTEMPTS = window.Config ? window.Config.auth.maxAttempts : 5;
    const LOCKOUT_TIME = window.Config ? window.Config.auth.lockoutTime : 15 * 60 * 1000;

    let form, input, errorMessage;
    let attempts = parseInt(sessionStorage.getItem('password_attempts') || '0');
    let lockoutUntil = parseInt(sessionStorage.getItem('lockout_until') || '0');
    let isSubmitting = false;

    function cacheElements() {
        form = document.getElementById('password-form');
        input = document.getElementById('password-input');
        errorMessage = document.getElementById('error-message');
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        input.value = '';
        input.focus();
        
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 5000);
    }

    async function checkPassword(event) {
        event.preventDefault();
        
        if (isSubmitting) {
            return; // Prevent double submission
        }
        
        // Check lockout
        if (Date.now() < lockoutUntil) {
            const minutesLeft = Math.ceil((lockoutUntil - Date.now()) / 60000);
            showError(`Too many attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`);
            return;
        }
        
        const userInput = input.value.trim();
        
        if (!userInput) {
            showError('Please enter the magic word.');
            return;
        }
        
        isSubmitting = true;
        errorMessage.textContent = 'Checking...';
        errorMessage.classList.add('show');
        
        try {
            const response = await fetch(AUTH_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: userInput })
            });
            
            const data = await response.json();
            
            if (data.success && data.token) {
                // Store token in sessionStorage (not localStorage for better security)
                sessionStorage.setItem('auth_token', data.token);
                sessionStorage.setItem('auth_expires', data.expires.toString());
                sessionStorage.removeItem('password_attempts');
                sessionStorage.removeItem('lockout_until');
                
                // Redirect to main page
                window.location.href = MAIN_PAGE;
            } else {
                // Failed authentication
                attempts++;
                sessionStorage.setItem('password_attempts', attempts.toString());
                
                if (attempts >= MAX_ATTEMPTS) {
                    lockoutUntil = Date.now() + LOCKOUT_TIME;
                    sessionStorage.setItem('lockout_until', lockoutUntil.toString());
                    showError(`Too many attempts. Locked for 15 minutes.`);
                } else {
                    const remaining = MAX_ATTEMPTS - attempts;
                    showError(`Nice try! Ask Al for the magic word. (${remaining} attempt${remaining !== 1 ? 's' : ''} remaining)`);
                }
            }
        } catch (error) {
            console.error('[Password] Auth error:', error);
            showError('Unable to verify password. Please try again later.');
        } finally {
            isSubmitting = false;
        }
    }

    function initPassword() {
        cacheElements();
        
        // Check if already authenticated
        const token = sessionStorage.getItem('auth_token');
        const expires = sessionStorage.getItem('auth_expires');
        
        if (token && expires && Date.now() < parseInt(expires)) {
            // Already authenticated, redirect to main page
            window.location.href = MAIN_PAGE;
            return;
        }
        
        // Clear expired auth
        if (token && expires && Date.now() >= parseInt(expires)) {
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('auth_expires');
        }
        
        if (form) {
            form.addEventListener('submit', checkPassword);
        }
        
        if (input) {
            input.focus();
        }
        
        // Show lockout message if locked
        if (Date.now() < lockoutUntil) {
            const minutesLeft = Math.ceil((lockoutUntil - Date.now()) / 60000);
            showError(`Too many attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`);
        }
    }

    // Initialize when DOM is ready
    (function init() {
        if (typeof Utils !== 'undefined' && Utils.ready) {
            Utils.ready(initPassword);
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initPassword);
        } else {
            initPassword();
        }
    })();
})();
