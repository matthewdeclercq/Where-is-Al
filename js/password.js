// Password gate logic for Where Is Al
(function() {
    'use strict';

    const PASSWORD = 'buffalo';
    const MAIN_PAGE = 'main.html';

    let form, input, errorMessage;

    function cacheElements() {
        form = document.getElementById('password-form');
        input = document.getElementById('password-input');
        errorMessage = document.getElementById('error-message');
    }

    function checkPassword(event) {
        event.preventDefault();
        
        const userInput = input.value.trim().toLowerCase();
        
        if (userInput === PASSWORD.toLowerCase()) {
            window.location.href = MAIN_PAGE;
        } else {
            errorMessage.textContent = "Nice try! Ask Al for the magic word.";
            errorMessage.classList.add('show');
            input.value = '';
            input.focus();
            
            setTimeout(() => {
                errorMessage.classList.remove('show');
            }, 3000);
        }
    }

    function initPassword() {
        cacheElements();
        
        if (form) {
            form.addEventListener('submit', checkPassword);
        }
        
        if (input) {
            input.focus();
        }
    }

    // Initialize when DOM is ready
    Utils.ready(initPassword);
})();
