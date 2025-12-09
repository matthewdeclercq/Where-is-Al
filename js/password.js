// Password gate logic for Where Is Al
(function() {
    'use strict';

    const PASSWORD = 'buffalo';
    const MAIN_PAGE = 'main.html';

    const form = document.getElementById('password-form');
    const input = document.getElementById('password-input');
    const errorMessage = document.getElementById('error-message');

    function checkPassword(event) {
        event.preventDefault();
        
        const userInput = input.value.trim().toLowerCase();
        
        if (userInput === PASSWORD.toLowerCase()) {
            // Correct password - redirect to main page
            window.location.href = MAIN_PAGE;
        } else {
            // Incorrect password - show friendly error message
            errorMessage.textContent = "Nice try! Ask Al for the magic word.";
            errorMessage.classList.add('show');
            input.value = '';
            input.focus();
            
            // Remove error message class after animation
            setTimeout(() => {
                errorMessage.classList.remove('show');
            }, 3000);
        }
    }

    // Handle form submission
    form.addEventListener('submit', checkPassword);

    // Focus input on page load
    input.focus();
})();

