import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
import re
from urllib.parse import urljoin, urlparse

class CatchDesMoinesEventScraper:
    def __init__(self, headless=True):
        """Initialize the scraper with Chrome WebDriver"""
        self.chrome_options = Options()
        if headless:
            self.chrome_options.add_argument("--headless")
        self.chrome_options.add_argument("--no-sandbox")
        self.chrome_options.add_argument("--disable-dev-shm-usage")
        self.chrome_options.add_argument("--disable-gpu")
        self.chrome_options.add_argument("--window-size=1920,1080")
        
    def extract_visit_website_url(self, event_url):
        """
        Extract the 'Visit Website' URL from a CatchDesMoines event page
        
        Args:
            event_url (str): The CatchDesMoines event URL
            
        Returns:
            str: The extracted visit website URL, or None if not found
        """
        driver = None
        try:
            # Initialize the WebDriver
            driver = webdriver.Chrome(options=self.chrome_options)
            driver.get(event_url)
            
            # Wait for the page to load
            wait = WebDriverWait(driver, 10)
            
            # Multiple strategies to find the "Visit Website" link
            visit_website_url = None
            
            # Strategy 1: Look for exact text "Visit Website"
            try:
                visit_link = wait.until(
                    EC.presence_of_element_located(
                        (By.XPATH, "//a[contains(text(), 'Visit Website')]")
                    )
                )
                visit_website_url = visit_link.get_attribute('href')
                print(f"Found via exact text match: {visit_website_url}")
            except:
                print("Strategy 1 failed: No exact 'Visit Website' text found")
            
            # Strategy 2: Look for links with 'website' in the text (case insensitive)
            if not visit_website_url:
                try:
                    visit_links = driver.find_elements(
                        By.XPATH, 
                        "//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'website')]"
                    )
                    for link in visit_links:
                        href = link.get_attribute('href')
                        if href and not href.startswith('mailto:') and 'catchdesmoines.com' not in href:
                            visit_website_url = href
                            print(f"Found via website text search: {visit_website_url}")
                            break
                except:
                    print("Strategy 2 failed: No 'website' text found")
            
            # Strategy 3: Look for external links (not catchdesmoines.com)
            if not visit_website_url:
                try:
                    all_links = driver.find_elements(By.TAG_NAME, "a")
                    external_links = []
                    
                    for link in all_links:
                        href = link.get_attribute('href')
                        if (href and 
                            href.startswith('http') and 
                            'catchdesmoines.com' not in href and 
                            not href.startswith('mailto:') and
                            not href.startswith('tel:')):
                            
                            link_text = link.text.strip().lower()
                            # Prioritize links with relevant text
                            if any(keyword in link_text for keyword in ['visit', 'website', 'more info', 'details', 'tickets']):
                                visit_website_url = href
                                print(f"Found via external link with relevant text: {visit_website_url}")
                                break
                            external_links.append(href)
                    
                    # If no prioritized link found, take the first external link
                    if not visit_website_url and external_links:
                        visit_website_url = external_links[0]
                        print(f"Found via first external link: {visit_website_url}")
                        
                except Exception as e:
                    print(f"Strategy 3 failed: {e}")
            
            # Strategy 4: Look in button elements
            if not visit_website_url:
                try:
                    buttons = driver.find_elements(By.TAG_NAME, "button")
                    for button in buttons:
                        if 'website' in button.text.lower():
                            # Check if button has onclick or data attributes
                            onclick = button.get_attribute('onclick')
                            if onclick and 'http' in onclick:
                                # Extract URL from onclick
                                url_match = re.search(r'https?://[^\s\'"]+', onclick)
                                if url_match:
                                    visit_website_url = url_match.group()
                                    print(f"Found via button onclick: {visit_website_url}")
                                    break
                except:
                    print("Strategy 4 failed: No button with website found")
            
            return visit_website_url
            
        except Exception as e:
            print(f"Error scraping {event_url}: {e}")
            return None
            
        finally:
            if driver:
                driver.quit()
    
    def extract_multiple_events(self, event_urls):
        """
        Extract visit website URLs from multiple event pages
        
        Args:
            event_urls (list): List of CatchDesMoines event URLs
            
        Returns:
            dict: Dictionary mapping event URLs to their visit website URLs
        """
        results = {}
        
        for event_url in event_urls:
            print(f"\nProcessing: {event_url}")
            visit_url = self.extract_visit_website_url(event_url)
            results[event_url] = visit_url
            
            # Add a small delay between requests to be respectful
            time.sleep(2)
            
        return results

# Alternative lightweight approach using requests + BeautifulSoup
def extract_visit_url_lightweight(event_url):
    """
    Lightweight approach using requests and BeautifulSoup
    This may work if the content is server-rendered
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(event_url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for "Visit Website" links
        visit_links = soup.find_all('a', string=re.compile(r'visit\s+website', re.IGNORECASE))
        
        for link in visit_links:
            href = link.get('href')
            if href and 'catchdesmoines.com' not in href:
                return href
        
        # Look for external links
        all_links = soup.find_all('a', href=True)
        for link in all_links:
            href = link['href']
            if (href.startswith('http') and 
                'catchdesmoines.com' not in href and 
                not href.startswith('mailto:')):
                return href
                
        return None
        
    except Exception as e:
        print(f"Lightweight extraction failed for {event_url}: {e}")
        return None

# Example usage
if __name__ == "__main__":
    # Test URLs
    test_urls = [
        "https://www.catchdesmoines.com/event/aroma-%26-art-party%3a-theme-series/53152/",
        "https://www.catchdesmoines.com/event/celebrate-color-diversity-at-the-arboretum/49439/"
    ]
    
    # Method 1: Try lightweight approach first
    print("=== Trying Lightweight Approach ===")
    for url in test_urls:
        print(f"\nProcessing: {url}")
        visit_url = extract_visit_url_lightweight(url)
        print(f"Visit Website URL: {visit_url}")
    
    # Method 2: Use Selenium for JavaScript-heavy sites
    print("\n=== Using Selenium Approach ===")
    scraper = CatchDesMoinesEventScraper(headless=True)
    results = scraper.extract_multiple_events(test_urls)
    
    print("\n=== Final Results ===")
    for event_url, visit_url in results.items():
        print(f"Event: {event_url}")
        print(f"Visit Website: {visit_url}")
        print("-" * 50)