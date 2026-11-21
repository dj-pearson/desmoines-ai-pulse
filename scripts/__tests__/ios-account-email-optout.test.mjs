#!/usr/bin/env node
/**
 * iOS has an in-app opt-out for the mail the lifecycle agents send
 * (WEB-LEGAL-012, AC2/AC3).
 *
 * The onboarding drip, milestone, re-engagement and win-back agents gate on
 * messagingAllowed, which lifecycle-classifier.ts derives from
 * profiles.communication_preferences.email_notifications. iOS Settings had
 * only "Weekly picks email" (user_email_preferences), which none of them read,
 * so an iOS user could not stop them from the app.
 *
 * There is no Swift compiler in the cloud session, so this reads the sources.
 * Behaviour is unit-tested in AccountEmailPreferenceTests.swift; this suite is
 * the part that runs on every `npm run test:offline`.
 */
import { readFileSync } from 'node:fs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

// Line comments out, so a doc comment cannot satisfy a check.
const strip = (src) => src.replace(/\/\/[^\n]*/g, '');

/** Body of the first function whose header matches `header`, by brace depth. */
function body(src, header) {
  const m = header.exec(src);
  if (!m) return '';
  const open = src.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return '';
}

// The key the server reads, taken from the classifier rather than restated.
const classifier = readFileSync('supabase/functions/_shared/agents/lifecycle-classifier.ts', 'utf8');
const serverKey = /commPref\.email_notifications !== false/.test(classifier) ? 'email_notifications' : null;
check('the classifier gates messagingAllowed on email_notifications !== false', serverKey !== null);

console.log('ios AccountEmailPreferenceService');
const svc = strip(readFileSync('ios/DesMoinesInsider/Services/AccountEmailPreferenceService.swift', 'utf8'));
check('writes the key the classifier reads', new RegExp(`static let key = "${serverKey}"`).test(svc));
check('logs consent under the web type', /static let consentType = "marketing_email"/.test(svc));

const optedIn = body(svc, /static func isOptedIn\(_ bag: \[String: Any\]\)[^{]*\{/);
check('isOptedIn exists', optedIn.length > 0);
check('absence or a non-boolean reads as opted in',
  /CFBooleanGetTypeID\(\) else \{ return true \}/.test(optedIn),
  'a missing key must not show "off" for an account the senders still mail');

const patch = body(svc, /static func patchBody\(merging on: Bool, into bag: \[String: Any\]\)[^{]*\{/);
check('the patch starts from the existing bag', /var merged = bag/.test(patch) && /merged\[key\] = on/.test(patch));

const set = body(svc, /func setEnabled\(_ on: Bool\) async throws[^{]*\{/);
check('setEnabled reads the bag before writing',
  /try await readBag\(userId: userId\)/.test(set) && set.indexOf('readBag(') < set.indexOf('.update('));
check('setEnabled writes profiles', /from\("profiles"\)[\s\S]*\.update\(body/.test(set));
check('setEnabled rolls back on failure', /catch \{\s*enabled = previous\s*throw error/.test(set));

const read = body(svc, /private func readBag\(userId: String\) async throws[^{]*\{/);
check('an unreadable bag throws instead of becoming {}', /else \{\s*throw /.test(read));

console.log('ios SettingsView');
const settings = strip(readFileSync('ios/DesMoinesInsider/Views/Profile/SettingsView.swift', 'utf8'));
check('Settings binds a toggle to setEnabled', /try await accountEmails\.setEnabled\(newValue\)/.test(settings));
check('Settings loads it', /\.task \{ await accountEmails\.load\(\) \}/.test(settings));
check('the toggle is disabled until loaded', /\.disabled\(accountEmails\.enabled == nil\)/.test(settings));

console.log('ios AuthService');
const auth = strip(readFileSync('ios/DesMoinesInsider/Services/AuthService.swift', 'utf8'));
const purge = body(auth, /private func purgeLocalUserState\(\)[^{]*\{/);
check('sign-out forgets the previous account value', /AccountEmailPreferenceService\.shared\.reset\(\)/.test(purge));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
