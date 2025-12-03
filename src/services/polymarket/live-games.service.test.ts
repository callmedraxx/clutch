/**
 * Unit tests for buildId extraction logic in live-games.service.ts
 */

import { extractBuildIdFromHtml } from './live-games.service';

// Mock logger to avoid console output during tests
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('extractBuildIdFromHtml', () => {
  describe('successful extraction', () => {
    it('should extract buildId from standard format', () => {
      const html = '<script>{"buildId":"bT8DCLGjG7eb8Y88faA_f","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('bT8DCLGjG7eb8Y88faA_f');
    });

    it('should extract buildId with different format', () => {
      const html = '<script>{"buildId":"6w0cVAj-lCsqW5cBTIuDH","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('6w0cVAj-lCsqW5cBTIuDH');
    });

    it('should extract buildId with spaces around colon', () => {
      const html = '<script>{"buildId" : "testBuildId123","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('testBuildId123');
    });

    it('should extract buildId with multiple spaces', () => {
      const html = '<script>{"buildId"    :    "spacedBuildId","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('spacedBuildId');
    });

    it('should extract buildId from large HTML with other content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Polymarket</title>
          <script>
            window.__NEXT_DATA__ = {
              "buildId":"ydeAKiopMLZxqGsdeVui4",
              "isFallback":false,
              "page":"/sports/live"
            };
          </script>
        </head>
        <body>
          <div>Lots of content here...</div>
        </body>
        </html>
      `;
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('ydeAKiopMLZxqGsdeVui4');
    });

    it('should extract buildId when it appears multiple times (first occurrence)', () => {
      const html = `
        <script>{"buildId":"firstBuildId","isFallback":false}</script>
        <script>{"buildId":"secondBuildId","isFallback":false}</script>
      `;
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('firstBuildId');
    });

    it('should extract buildId with special characters', () => {
      const html = '<script>{"buildId":"build-id_with.special@chars","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('build-id_with.special@chars');
    });

    it('should extract buildId with numbers and letters', () => {
      const html = '<script>{"buildId":"abc123XYZ789","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('abc123XYZ789');
    });
  });

  describe('edge cases and failures', () => {
    it('should return null when buildId is not found', () => {
      const html = '<script>{"isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBeNull();
    });

    it('should return null for empty HTML', () => {
      const html = '';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBeNull();
    });

    it('should return null when buildId value is empty', () => {
      const html = '<script>{"buildId":"","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBeNull();
    });

    it('should return null when buildId is missing quotes', () => {
      const html = '<script>{"buildId:invalidFormat","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBeNull();
    });

    it('should return null when buildId uses single quotes instead of double', () => {
      const html = "<script>{'buildId':'testBuildId','isFallback':false}</script>";
      const result = extractBuildIdFromHtml(html);
      expect(result).toBeNull();
    });

    it('should handle HTML without script tags', () => {
      const html = '<div>Some content without buildId</div>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBeNull();
    });

    it('should handle very large HTML strings efficiently', () => {
      const largeContent = 'x'.repeat(1000000); // 1MB of content
      const html = `${largeContent}<script>{"buildId":"testBuildId","isFallback":false}</script>${largeContent}`;
      const startTime = Date.now();
      const result = extractBuildIdFromHtml(html);
      const endTime = Date.now();
      
      expect(result).toBe('testBuildId');
      // Should complete quickly even with large HTML
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
    });

    it('should handle buildId with escaped quotes in the value', () => {
      // Note: The regex expects unescaped quotes, so this should fail
      // This tests the current behavior
      const html = '<script>{"buildId":"test\\"buildId","isFallback":false}</script>';
      const result = extractBuildIdFromHtml(html);
      // The regex will match up to the escaped quote, so it will extract "test"
      expect(result).toBe('test');
    });
  });

  describe('real-world HTML patterns', () => {
    it('should extract from Next.js __NEXT_DATA__ script tag', () => {
      const html = `
        <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{}},"page":"/sports/live","query":{},"buildId":"bT8DCLGjG7eb8Y88faA_f","isFallback":false,"gssp":true,"customServer":true}
        </script>
      `;
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('bT8DCLGjG7eb8Y88faA_f');
    });

    it('should extract from minified HTML', () => {
      const html = '<script>{"buildId":"minified123","isFallback":false,"page":"/","query":{}}</script>';
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('minified123');
    });

    it('should extract from HTML with newlines and formatting', () => {
      const html = `
        <script>
          {
            "buildId": "formattedBuildId",
            "isFallback": false
          }
        </script>
      `;
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe('formattedBuildId');
    });
  });
});

describe('buildId format validation', () => {
  it('should accept various valid buildId formats', () => {
    const testCases = [
      { html: '{"buildId":"short","isFallback":false}', expected: 'short' },
      { html: '{"buildId":"very-long-build-id-with-many-characters","isFallback":false}', expected: 'very-long-build-id-with-many-characters' },
      { html: '{"buildId":"ABC123","isFallback":false}', expected: 'ABC123' },
      { html: '{"buildId":"abc-123_xyz","isFallback":false}', expected: 'abc-123_xyz' },
      { html: '{"buildId":"6w0cVAj-lCsqW5cBTIuDH","isFallback":false}', expected: '6w0cVAj-lCsqW5cBTIuDH' },
    ];

    testCases.forEach(({ html, expected }) => {
      const result = extractBuildIdFromHtml(html);
      expect(result).toBe(expected);
    });
  });
});

