import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Source-level guard rather than a render test: the defect was the screen
// hand-rolling its own upload against `/creator/profile/upload-url`, a route the
// API has never served (app.ts answers 404). Every creator who picked a photo
// during registration lost it silently. Asserting the screen owns no endpoint
// string of its own is what actually catches a regression here.
const source = readFileSync(
  resolve(process.cwd(), 'src/screens/CompleteProfileScreen.jsx'),
  'utf8'
);

describe('CompleteProfileScreen photo upload', () => {
  it('does not call the non-existent /creator/profile/upload-url route', () => {
    expect(source).not.toMatch(/creator\/profile\/upload-url/);
  });

  it('delegates the upload to profilePictureService', () => {
    expect(source).toMatch(/profilePictureService/);
  });

  it('does not reject photos on file size — compression handles any input', () => {
    expect(source).not.toMatch(/no debe superar/);
  });
});
