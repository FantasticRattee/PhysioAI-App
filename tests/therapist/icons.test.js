import { icon, iconEl } from '../../Therapist/shared/core/icons.js';

describe('icons.js - icon()', () => {
  it('returns an SVG markup string for a known icon name', () => {
    const out = icon('body');
    expect(typeof out).toBe('string');
    expect(out).toContain('<svg');
    expect(out).toContain('</svg>');
    // body icon includes a circle for the head
    expect(out).toContain('<circle');
  });

  it('uses default size of 20 when no opts given', () => {
    const out = icon('body');
    expect(out).toContain('width="20"');
    expect(out).toContain('height="20"');
  });

  it('uses default color currentColor and stroke 1.6 by default', () => {
    const out = icon('mic');
    expect(out).toContain('stroke="currentColor"');
    expect(out).toContain('stroke-width="1.6"');
  });

  it('always includes viewBox 0 0 24 24 and fill="none"', () => {
    const out = icon('home');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('fill="none"');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('stroke-linecap="round"');
    expect(out).toContain('stroke-linejoin="round"');
  });

  it('size option sets both width and height', () => {
    const out = icon('body', { size: 48 });
    expect(out).toContain('width="48"');
    expect(out).toContain('height="48"');
  });

  it('color option appears in the markup (stroke attribute)', () => {
    const out = icon('body', { color: '#ff0000' });
    expect(out).toContain('stroke="#ff0000"');
  });

  it('color option replaces CUR placeholder in fill-based icons', () => {
    // play uses fill="CUR" which should be replaced by the color
    const out = icon('play', { color: '#123456' });
    expect(out).toContain('fill="#123456"');
    // and the literal CUR placeholder must be gone
    expect(out).not.toContain('CUR');
  });

  it('stroke option sets stroke-width', () => {
    const out = icon('check', { stroke: 3 });
    expect(out).toContain('stroke-width="3"');
  });

  it('honors all opts together (size, color, stroke)', () => {
    const out = icon('user', { size: 32, color: 'blue', stroke: 2 });
    expect(out).toContain('width="32"');
    expect(out).toContain('height="32"');
    expect(out).toContain('stroke="blue"');
    expect(out).toContain('stroke-width="2"');
  });

  it('embeds the correct path body for a stroke-only icon (close)', () => {
    const out = icon('close');
    // close icon is two crossing lines
    expect(out).toContain('<line');
    expect(out).toContain('x1="6"');
  });

  it('returns a valid empty-body svg string for an unknown icon name without throwing', () => {
    let out;
    expect(() => { out = icon('__not_a_real_icon__'); }).not.toThrow();
    expect(typeof out).toBe('string');
    expect(out).toContain('<svg');
    expect(out).toContain('</svg>');
    // unknown name -> empty body between the tags
    expect(out).toContain('aria-hidden="true">');
    // verify there is nothing between the close of opening tag and </svg>
    const inner = out.replace(/^.*aria-hidden="true">/, '').replace('</svg>', '');
    expect(inner).toBe('');
  });

  it('does not throw and returns a string when opts is omitted entirely', () => {
    expect(() => icon('chart')).not.toThrow();
    expect(typeof icon('chart')).toBe('string');
  });
});

describe('icons.js - iconEl()', () => {
  it('returns a DOM element', () => {
    const el = iconEl('body');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.tagName).toBe('SPAN');
  });

  it('wraps the svg inside a span with inline-flex display', () => {
    const el = iconEl('body');
    expect(el.style.display).toBe('inline-flex');
  });

  it('outerHTML contains an <svg> element', () => {
    const el = iconEl('home');
    expect(el.outerHTML).toContain('<svg');
    const svg = el.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('passes opts through to the inner svg markup', () => {
    const el = iconEl('user', { size: 40, color: 'green', stroke: 2.5 });
    const svg = el.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('40');
    expect(svg.getAttribute('height')).toBe('40');
    expect(svg.getAttribute('stroke')).toBe('green');
    expect(svg.getAttribute('stroke-width')).toBe('2.5');
  });

  it('handles unknown icon names without throwing and still produces an svg', () => {
    let el;
    expect(() => { el = iconEl('__nope__'); }).not.toThrow();
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('works when opts is omitted', () => {
    const el = iconEl('check');
    const svg = el.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');
  });
});
