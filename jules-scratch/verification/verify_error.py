from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:3000")

        # Step 1: Click "Start Live Demo"
        start_demo_button = page.get_by_role("button", name="Start Live Demo")
        expect(start_demo_button).to_be_visible()
        start_demo_button.click()

        # Step 2: Click "Analyze Location"
        analyze_button = page.get_by_role("button", name="Analyze Location")
        expect(analyze_button).to_be_visible()
        analyze_button.click()

        # Wait for the analysis to complete.
        # We can wait for the "Location Intelligence Report" heading to be visible.
        expect(page.get_by_role("heading", name="Location Intelligence Report")).to_be_visible(timeout=20000)

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/error_screenshot.png")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error_screenshot.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
