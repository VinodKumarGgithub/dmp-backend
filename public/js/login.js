
// API Base URL - dynamically determine based on current host
const API_BASE = window.location.protocol + '//' + window.location.host;
//  check if login , if yes go for index.html else login.html
let token = localStorage.getItem("token");
if(token){
window.location.href = "index.html"; 
}


(async function(){
  const form = document.getElementById('loginForm');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const msg = document.getElementById('msg');
  const toggle = document.getElementById('togglePass');

  // Toggle password visibility
  toggle.addEventListener('click', () => {
    const isPwd = password.type === 'password';
    password.type = isPwd ? 'text' : 'password';
    toggle.textContent = isPwd ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(isPwd));
  });

  // Show message helper
   function showMessage(text, kind='error'){
    msg.style.display = 'block';
    msg.className = kind === 'error' ? 'error' : 'success';
    msg.textContent = text;
  }

  // Simple submit handler (demo)
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); // prevent a real submit
    msg.style.display = 'none';

    const u = username.value.trim();
    const p = password.value.trim();

    // Basic validation
    if (!u || !p) {
      showMessage('Please enter both username and password.', 'error');
      if (!u) username.focus();
      else password.focus();
      return;
    }

    try {
      // Example: send credentials using fetch (commented as placeholder)
      let token = null
      
      let data = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      })

      data = await data.json()
      token = await  data.data?.token ?? null
      console.log(data)
      if(data.success == false){ 
        return showMessage(`Login failed: ${data.error.message}`);
      } else {

      // Respect "remember" option: if checked, persist token longer
      const remember = document.getElementById('remember').checked;

      // Save token in localStorage (demo). In a real app use secure cookies / httpOnly tokens.
      localStorage.setItem('token', token);
      if (remember) localStorage.setItem('remembered', '1');
      else localStorage.removeItem('remembered');

      showMessage('Login successful — redirecting...', 'success');

      // small delay so user sees message, then redirect
      setTimeout(() => {
        // go to index.html (replace with app entry)
        window.location.reload()
      }, 700);
}
    } catch (err) {
      showMessage('An unexpected error occurred. Try again.', 'error');
      console.error(err);
    }
  });

  // Optional: allow Enter on inputs to submit (already default)
  // Accessibility: clear message when user edits fields
  [username, password].forEach(el => {
    el.addEventListener('input', () => {
      msg.style.display = 'none';
    });
  });
})();