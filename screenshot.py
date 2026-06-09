from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        page.goto("http://localhost:5000/")
        page.evaluate("""
            localStorage.setItem("user", JSON.stringify({id: 1, full_name: "Prest Manager", email: "prest@farm.com", farm_name: "Ikorodu Farm"}));
        """)
        page.goto("http://localhost:5000/app.html")

        # Wait for the dashboard to load
        page.wait_for_selector("#vaccine-card", timeout=10000)

        # In CSS, the class 'hidden' has `display: none`. Let's remove it and set display directly just to be sure.
        page.evaluate("""
            const modal = document.getElementById('add-vaccine-modal');
            modal.classList.remove('hidden');
            modal.style.display = 'block';
        """)

        page.wait_for_timeout(1000)

        # Full page screenshot
        page.screenshot(path="/home/jules/verification/modal-full.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    verify_frontend()
