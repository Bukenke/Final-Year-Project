// AgriFeed Pro Landing Page and Standalone Authentication Scripts

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scroll header shadowing interaction (only runs if nav exists on landing)
    const nav = document.querySelector('nav');
    if (nav) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                nav.classList.add('shadow-md');
                nav.classList.add('bg-white');
            } else {
                nav.classList.remove('shadow-md');
                nav.classList.remove('bg-white');
            }
        });
    }

    // 2. Intersection observer for scroll animations (for landing page sections)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });

    // 3. Bind standalone forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
});

// ── ALERT HELPERS ─────────────────────────────────────────────────────────

function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('authAlert');
    const alertIcon = document.getElementById('authAlertIcon');
    const alertText = document.getElementById('authAlertText');
    
    if (!alertBox || !alertText) return;
    
    alertText.textContent = message;
    alertBox.classList.remove('hidden');
    
    if (type === 'error') {
        alertBox.className = "p-4 rounded-lg text-sm flex items-center gap-3 bg-error-container text-on-error-container border border-error";
        if (alertIcon) alertIcon.textContent = "error";
    } else if (type === 'success') {
        alertBox.className = "p-4 rounded-lg text-sm flex items-center gap-3 bg-primary-fixed text-on-primary-fixed border border-primary";
        if (alertIcon) alertIcon.textContent = "check_circle";
    }
}

function hideAlert() {
    const alertBox = document.getElementById('authAlert');
    if (alertBox) {
        alertBox.classList.add('hidden');
    }
}

// ── AUTHENTICATION API CALLS ──────────────────────────────────────────────

async function handleLogin(e) {
    e.preventDefault();
    hideAlert();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showAlert('Please fill in all fields.');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Signing in...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Authentication failed.');
        }
        
        // Success
        showAlert('Login successful! Redirecting...', 'success');
        localStorage.setItem('user', JSON.stringify(data.user));
        
        setTimeout(() => {
            window.location.href = 'app.html';
        }, 1000);
        
    } catch (err) {
        console.error('Login error:', err);
        
        // Fallback to local simulation if server is offline or fails to fetch
        if (err.message.includes('Failed to fetch') || err.message.includes('Server could not')) {
            showAlert('Offline mode: Login successful! (Demo)', 'success');
            localStorage.setItem('user', JSON.stringify({
                id: 1,
                full_name: 'Demo Farmer',
                email: email,
                farm_name: 'Demo Farm'
            }));
            
            setTimeout(() => {
                window.location.href = 'app.html';
            }, 1000);
        } else {
            showAlert(err.message);
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();
    hideAlert();
    
    const fullName = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const farmName = document.getElementById('registerFarm').value.trim();
    const password = document.getElementById('registerPassword').value;
    
    if (!fullName || !email || !farmName || !password) {
        showAlert('Please fill in all fields.');
        return;
    }
    
    if (password.length < 6) {
        showAlert('Password must be at least 6 characters long.');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                full_name: fullName,
                email: email,
                farm_name: farmName,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Registration failed.');
        }
        
        showAlert('Account created! Logging in...', 'success');
        localStorage.setItem('user', JSON.stringify(data.user));
        
        setTimeout(() => {
            window.location.href = 'app.html';
        }, 1000);
        
    } catch (err) {
        console.error('Registration error:', err);
        
        // Fallback to local simulation if server is offline or fails to fetch
        if (err.message.includes('Failed to fetch') || err.message.includes('Server could not')) {
            showAlert('Offline mode: Account created! (Demo)', 'success');
            localStorage.setItem('user', JSON.stringify({
                id: 1,
                full_name: fullName,
                email: email,
                farm_name: farmName
            }));
            
            setTimeout(() => {
                window.location.href = 'app.html';
            }, 1000);
        } else {
            showAlert(err.message);
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    }
}