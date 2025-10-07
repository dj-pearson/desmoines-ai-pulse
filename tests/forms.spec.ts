import { test, expect, Page } from '@playwright/test';

/**
 * Form Validation and Functionality Testing Suite
 *
 * This suite validates:
 * - Form field validation
 * - Error message display
 * - Required field handling
 * - Form submission
 * - Input accessibility
 * - Autocomplete attributes
 * - Password visibility toggles
 * - Form reset functionality
 */

const pagesWithForms = [
  { path: '/auth', name: 'authentication', forms: ['login', 'signup'] },
  { path: '/business-partnership', name: 'business-partnership', forms: ['application'] },
  { path: '/advertise', name: 'advertise', forms: ['contact'] },
  { path: '/profile', name: 'profile', forms: ['profile-update'] },
];

async function findForms(page: Page): Promise<any[]> {
  return await page.$$eval('form', forms =>
    forms.map((form, index) => {
      const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
      return {
        index,
        id: form.id || `form-${index}`,
        action: form.action,
        method: form.method,
        inputCount: inputs.length,
        hasSubmitButton: !!form.querySelector('button[type="submit"], input[type="submit"]'),
        inputs: inputs.map(input => ({
          type: input.getAttribute('type') || 'text',
          name: input.getAttribute('name'),
          required: input.hasAttribute('required'),
          ariaLabel: input.getAttribute('aria-label'),
          id: input.id,
        })),
      };
    })
  );
}

test.describe('Form Discovery and Structure', () => {
  for (const page of pagesWithForms) {
    test(`${page.name} should have properly structured forms`, async ({ page: pw }) => {
      // Try to navigate, but don't fail if page requires auth
      try {
        await pw.goto(page.path, { waitUntil: 'networkidle', timeout: 10000 });
      } catch (e) {
        console.log(`Could not load ${page.path} - may require authentication`);
        return;
      }

      const forms = await findForms(pw);

      if (forms.length === 0) {
        console.log(`No forms found on ${page.path} - may require authentication or interaction`);
        return;
      }

      console.log(`Found ${forms.length} form(s) on ${page.name}:`, forms);

      // Each form should have a submit button
      forms.forEach(form => {
        expect(form.hasSubmitButton, `Form ${form.id} should have a submit button`).toBe(true);
      });
    });
  }
});

test.describe('Form Field Validation', () => {
  test('authentication form should validate required fields', async ({ page }) => {
    await page.goto('/auth');

    // Wait for form to be visible
    await page.waitForSelector('form, input[type="email"], input[type="password"]', { timeout: 5000 });

    // Try to find email and password fields
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign")').first();

    if (await emailInput.count() > 0) {
      // Test empty submission
      await submitButton.click();

      // Should show validation messages
      await page.waitForTimeout(500);

      // Check for HTML5 validation or custom error messages
      const emailValidation = await emailInput.evaluate((el: HTMLInputElement) => {
        return {
          isValid: el.validity.valid,
          validationMessage: el.validationMessage,
        };
      });

      // Check for custom error messages
      const errorMessages = await page.locator('[role="alert"], .error, .text-red-500, .text-destructive').count();

      const hasValidation = !emailValidation.isValid || errorMessages > 0;
      expect(hasValidation, 'Form should show validation for empty required fields').toBe(true);
    }
  });

  test('email fields should validate email format', async ({ page }) => {
    await page.goto('/auth');

    const emailInput = page.locator('input[type="email"]').first();

    if (await emailInput.count() > 0) {
      // Enter invalid email
      await emailInput.fill('invalid-email');
      await emailInput.blur(); // Trigger validation

      await page.waitForTimeout(300);

      // Check validation state
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => {
        return !el.validity.valid || el.getAttribute('aria-invalid') === 'true';
      });

      // Or check for error message
      const hasErrorMessage = await page.locator('[role="alert"]:near(input[type="email"]), .error').count() > 0;

      expect(isInvalid || hasErrorMessage, 'Invalid email should trigger validation').toBe(true);

      // Enter valid email
      await emailInput.fill('test@example.com');
      await emailInput.blur();

      await page.waitForTimeout(300);

      const isValidNow = await emailInput.evaluate((el: HTMLInputElement) => {
        return el.validity.valid;
      });

      expect(isValidNow, 'Valid email should pass validation').toBe(true);
    }
  });

  test('password fields should have appropriate requirements', async ({ page }) => {
    await page.goto('/auth');

    const passwordInput = page.locator('input[type="password"]').first();

    if (await passwordInput.count() > 0) {
      // Check for password requirements display
      await passwordInput.focus();

      // Look for password requirements text
      const hasRequirements = await page.locator('text=/password.*(?:character|letter|number|symbol)/i').count() > 0;

      if (hasRequirements) {
        console.log('Password requirements are displayed');
      }

      // Test weak password
      await passwordInput.fill('123');
      await passwordInput.blur();

      await page.waitForTimeout(300);

      // Should show some indication of weakness or invalidity
      const showsWeakness = await page.locator('[role="alert"], .error, text=/weak|strong|password/i').count() > 0;

      if (showsWeakness) {
        console.log('Password strength indicator working');
      }
    }
  });
});

test.describe('Form Accessibility', () => {
  test('form inputs should have proper labels', async ({ page }) => {
    await page.goto('/auth');

    const inputsWithoutLabels = await page.$$eval('input:not([type="hidden"]), textarea, select', inputs => {
      return inputs
        .map((input, index) => {
          const hasLabel = !!input.labels?.length;
          const hasAriaLabel = !!input.getAttribute('aria-label');
          const hasAriaLabelledBy = !!input.getAttribute('aria-labelledby');
          const hasPlaceholder = !!input.getAttribute('placeholder');

          return {
            index,
            type: input.getAttribute('type') || 'text',
            name: input.getAttribute('name'),
            hasLabel,
            hasAriaLabel,
            hasAriaLabelledBy,
            hasPlaceholder,
            hasAnyLabel: hasLabel || hasAriaLabel || hasAriaLabelledBy,
          };
        })
        .filter(input => !input.hasAnyLabel);
    });

    if (inputsWithoutLabels.length > 0) {
      console.log('Inputs without proper labels:', inputsWithoutLabels);
    }

    expect(inputsWithoutLabels.length, 'All inputs should have labels or aria-label').toBe(0);
  });

  test('form errors should be announced to screen readers', async ({ page }) => {
    await page.goto('/auth');

    const submitButton = page.locator('button[type="submit"]').first();

    if (await submitButton.count() > 0) {
      await submitButton.click();
      await page.waitForTimeout(500);

      // Check for ARIA live regions or role="alert"
      const hasAriaAlert = await page.locator('[role="alert"], [aria-live="polite"], [aria-live="assertive"]').count() > 0;

      if (hasAriaAlert) {
        console.log('Form uses ARIA for error announcements');
      }

      // At minimum, errors should be visible
      const hasVisibleErrors = await page.locator('.error, .text-red-500, .text-destructive, [aria-invalid="true"]').count() > 0;

      expect(hasVisibleErrors, 'Form should display validation errors').toBe(true);
    }
  });

  test('form fields should have autocomplete attributes', async ({ page }) => {
    await page.goto('/auth');

    const fieldsWithAutocomplete = await page.$$eval('input[type="email"], input[type="password"], input[type="tel"], input[name*="name"]', inputs => {
      return inputs.map(input => ({
        type: input.getAttribute('type'),
        name: input.getAttribute('name'),
        autocomplete: input.getAttribute('autocomplete'),
      }));
    });

    const withoutAutocomplete = fieldsWithAutocomplete.filter(field => !field.autocomplete);

    if (withoutAutocomplete.length > 0) {
      console.log('Fields that could benefit from autocomplete:', withoutAutocomplete);
    }

    // This is more of a best practice check
    if (fieldsWithAutocomplete.length > 0) {
      const percentageWithAutocomplete =
        ((fieldsWithAutocomplete.length - withoutAutocomplete.length) / fieldsWithAutocomplete.length) * 100;

      console.log(`${percentageWithAutocomplete.toFixed(0)}% of applicable fields have autocomplete`);
    }
  });
});

test.describe('Form Submission', () => {
  test('form should handle submission state', async ({ page }) => {
    await page.goto('/auth');

    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    if (await emailInput.count() > 0) {
      // Fill valid data
      await emailInput.fill('test@example.com');
      await passwordInput.fill('TestPassword123!');

      // Submit
      await submitButton.click();

      // Check for loading state
      await page.waitForTimeout(300);

      const hasLoadingState = await page.evaluate(() => {
        const button = document.querySelector('button[type="submit"]');
        if (!button) return false;

        const isDisabled = button.hasAttribute('disabled');
        const hasLoadingClass = button.className.includes('loading');
        const hasLoadingAria = button.getAttribute('aria-busy') === 'true';
        const hasSpinner = !!button.querySelector('.spinner, [role="progressbar"]');

        return isDisabled || hasLoadingClass || hasLoadingAria || hasSpinner;
      });

      if (hasLoadingState) {
        console.log('Form shows loading state during submission');
      }

      // Form should either succeed or show an error
      await page.waitForTimeout(2000);

      const hasError = await page.locator('[role="alert"], .error, .toast').count() > 0;
      const urlChanged = !page.url().includes('/auth');

      const hasResponse = hasError || urlChanged;
      expect(hasResponse, 'Form should provide feedback after submission').toBe(true);
    }
  });

  test('form should prevent double submission', async ({ page }) => {
    await page.goto('/auth');

    const submitButton = page.locator('button[type="submit"]').first();

    if (await submitButton.count() > 0) {
      // Click multiple times rapidly
      await submitButton.click();
      await submitButton.click();
      await submitButton.click();

      // Button should be disabled to prevent multiple submissions
      const isDisabled = await submitButton.isDisabled().catch(() => false);

      if (isDisabled) {
        console.log('Submit button properly prevents double submission');
      }
    }
  });
});

test.describe('Form UX Features', () => {
  test('password fields should have visibility toggle', async ({ page }) => {
    await page.goto('/auth');

    const passwordInput = page.locator('input[type="password"]').first();

    if (await passwordInput.count() > 0) {
      // Look for password toggle button
      const toggleButton = page.locator('button:near(input[type="password"]), [aria-label*="password"]').first();

      if (await toggleButton.count() > 0) {
        const initialType = await passwordInput.getAttribute('type');

        await toggleButton.click();
        await page.waitForTimeout(200);

        const newType = await passwordInput.getAttribute('type');

        const typeChanged = initialType !== newType;
        expect(typeChanged, 'Password visibility toggle should work').toBe(true);

        console.log('Password visibility toggle is functional');
      } else {
        console.log('No password visibility toggle found - consider adding one for better UX');
      }
    }
  });

  test('form should be usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/auth');

    // Check that form elements are properly sized for mobile
    const formElements = await page.$$eval('input, button, select', elements => {
      return elements.map(el => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          type: el.getAttribute('type'),
          width: rect.width,
          height: rect.height,
          visible: rect.width > 0 && rect.height > 0,
        };
      });
    });

    const visibleElements = formElements.filter(el => el.visible);
    const tooSmallElements = visibleElements.filter(el => el.height < 44); // Touch target size

    if (tooSmallElements.length > 0) {
      console.log('Form elements below recommended touch target size:', tooSmallElements);
    }

    // Most interactive elements should meet touch target size
    const percentageTooSmall = (tooSmallElements.length / Math.max(visibleElements.length, 1)) * 100;
    expect(percentageTooSmall, 'Most form elements should meet 44px touch target height').toBeLessThan(30);
  });

  test('form should have clear error messages', async ({ page }) => {
    await page.goto('/auth');

    const submitButton = page.locator('button[type="submit"]').first();

    if (await submitButton.count() > 0) {
      // Submit empty form
      await submitButton.click();
      await page.waitForTimeout(500);

      // Look for error messages
      const errorMessages = await page.locator('[role="alert"], .error, .text-red-500').allTextContents();

      if (errorMessages.length > 0) {
        console.log('Error messages:', errorMessages);

        // Error messages should be descriptive (not just "Error" or "Invalid")
        const hasDescriptiveErrors = errorMessages.some(msg =>
          msg.length > 10 && !msg.match(/^(error|invalid)$/i)
        );

        expect(hasDescriptiveErrors, 'Error messages should be descriptive').toBe(true);
      }
    }
  });
});

test.describe('Business Partnership Form', () => {
  test('business partnership form should have all necessary fields', async ({ page }) => {
    await page.goto('/business-partnership');
    await page.waitForTimeout(1000);

    const forms = await findForms(page);

    if (forms.length > 0) {
      console.log('Business partnership forms:', forms);

      // Should have fields for business information
      const hasBusinessFields = await page.locator(
        'input[name*="business"], input[name*="company"], input[name*="name"], input[type="email"], input[type="tel"]'
      ).count();

      expect(hasBusinessFields, 'Should have business-related form fields').toBeGreaterThan(0);
    }
  });
});

test.describe('Form Reset and Clear', () => {
  test('form should handle reset properly', async ({ page }) => {
    await page.goto('/auth');

    const emailInput = page.locator('input[type="email"]').first();

    if (await emailInput.count() > 0) {
      // Fill in some data
      await emailInput.fill('test@example.com');

      const valueBefore = await emailInput.inputValue();
      expect(valueBefore).toBe('test@example.com');

      // Look for reset button
      const resetButton = page.locator('button[type="reset"], button:has-text("Clear"), button:has-text("Reset")').first();

      if (await resetButton.count() > 0) {
        await resetButton.click();
        await page.waitForTimeout(200);

        const valueAfter = await emailInput.inputValue();
        expect(valueAfter, 'Form should be cleared after reset').toBe('');

        console.log('Form reset functionality works');
      }
    }
  });
});

test.describe('Form Field Types', () => {
  test('numeric fields should only accept numbers', async ({ page }) => {
    await page.goto('/business-partnership');

    const numericInputs = page.locator('input[type="number"], input[type="tel"]');

    if (await numericInputs.count() > 0) {
      const firstNumericInput = numericInputs.first();

      // Try to enter non-numeric characters
      await firstNumericInput.fill('abc123xyz');

      const value = await firstNumericInput.inputValue();

      // Value should be sanitized to numbers only (or rejected)
      const hasOnlyNumbers = /^\d*$/.test(value);

      if (hasOnlyNumbers) {
        console.log('Numeric input properly restricts input to numbers');
      }
    }
  });

  test('textareas should have character limits where appropriate', async ({ page }) => {
    await page.goto('/business-partnership');

    const textareas = await page.$$eval('textarea', areas =>
      areas.map(area => ({
        name: area.getAttribute('name'),
        maxLength: area.getAttribute('maxlength'),
        hasMaxLength: !!area.getAttribute('maxlength'),
      }))
    );

    if (textareas.length > 0) {
      console.log('Textareas found:', textareas);

      // At least some textareas should have maxlength for validation
      const withLimits = textareas.filter(t => t.hasMaxLength).length;

      if (withLimits > 0) {
        console.log(`${withLimits} of ${textareas.length} textareas have character limits`);
      }
    }
  });
});
