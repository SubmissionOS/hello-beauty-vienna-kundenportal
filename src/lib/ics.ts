import type { Appointment } from './data/types';
import { salon } from './salon';

/** Kalendereintrag (.ics, RFC 5545) für einen Termin – in Wiener Ortszeit, ohne Server. */
export function appointmentIcs(a: Appointment, title: string, now = new Date()): string {
  const local = (wall: string) => wall.replace(/[-:]/g, '') + '00';
  const end = new Date(new Date(`${a.start}:00Z`).getTime() + a.durationMinutes * 60_000).toISOString().slice(0, 16);
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hello Beauty//Kundenportal//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Vienna',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${a.id}@hello-beauty`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Vienna:${local(a.start)}`,
    `DTEND;TZID=Europe/Vienna:${local(end)}`,
    `SUMMARY:${esc(title)}`,
    `LOCATION:${esc(`${salon.name}, ${salon.street}, ${salon.postalCode} ${salon.city}`)}`,
    `DESCRIPTION:${esc(`${a.serviceName} · ${a.staffName} · ${salon.phone}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Bietet die .ics-Datei zum Öffnen/Speichern an (iOS öffnet sie direkt im Kalender). */
export function downloadIcs(a: Appointment, title: string) {
  const blob = new Blob([appointmentIcs(a, title)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hello-beauty-${a.start.slice(0, 10)}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
