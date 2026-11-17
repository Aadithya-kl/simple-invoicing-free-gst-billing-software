import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WhatsAppSupportBubble from './WhatsAppSupportBubble';

describe('WhatsAppSupportBubble', () => {
  it('links to a WhatsApp chat with the support number in a new tab', () => {
    const html = renderToString(<WhatsAppSupportBubble />);
    expect(html).toContain('href="https://wa.me/919871052015"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Chat with support on WhatsApp"');
  });
});
