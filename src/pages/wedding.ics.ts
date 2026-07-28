import type { APIRoute } from 'astro';
import { EVENTS, addressOf, instantOf } from '../data/wedding';

/**
 * Emits /wedding.ics at build time from src/data/wedding.ts. A static endpoint
 * rather than a checked-in file, so the calendar can never drift from the
 * times rendered on the page.
 *
 * DTSTART/DTEND are written as UTC with a Z suffix instead of carrying a
 * VTIMEZONE block. Both are valid RFC 5545; UTC is the form with no room for a
 * client to disagree, which is what matters when half the guest list opens it
 * on a phone set to Swiss time.
 */

const PRODID = '-//Steeja and Arjun//Wedding//EN';

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are special. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** 2026-09-06T10:00:00.000Z -> 20260906T100000Z */
function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

const encoder = new TextEncoder();

/**
 * RFC 5545 §3.1: no line may exceed 75 octets. Continuation lines begin with a
 * single space, which counts towards the 75. Measured in octets and split on
 * code points, so a multi-byte character is never cut in half — iOS Calendar
 * rejects the whole file if it is.
 */
function fold(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let octets = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > 75) {
      out.push(current);
      current = ' ';
      octets = 1;
    }
    current += char;
    octets += size;
  }

  out.push(current);
  return out;
}

function buildCalendar(now: Date): string {
  const dtstamp = stamp(now);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of EVENTS) {
    const description = `${event.note} ${event.mapsLink}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@steeja-arjun`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(instantOf(event.start))}`,
      `DTEND:${stamp(instantOf(event.end))}`,
      `SUMMARY:${escapeText(event.title)}`,
      `LOCATION:${escapeText(addressOf(event))}`,
      `DESCRIPTION:${escapeText(description)}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  // CRLF throughout, including a trailing one — some parsers drop the last line
  // without it.
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}

export const GET: APIRoute = () =>
  new Response(buildCalendar(new Date()), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="steeja-and-arjun.ics"',
    },
  });
