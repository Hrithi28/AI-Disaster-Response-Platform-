import { describe, expect, test } from 'vitest';
import { numberIn, parseCampCommand, peopleFromSpeech, severityFromSpeech } from '../lib/voice';

const inv = ['Food packets', 'Milk powder', 'Rice', 'Medicine kits', 'ORS sachets', 'Blankets', 'Tarpaulins', 'Drinking water'].map((item) => ({ item, unit: 'u' }));

describe('voice command understanding', () => {
  test('people counts from speech', () => {
    expect(peopleFromSpeech('Six people are trapped on the roof')).toBe(6);
    expect(peopleFromSpeech('no water for 20 families')).toBe(80);
    expect(peopleFromSpeech('we are fine')).toBeNull();
  });
  test('severity and numbers', () => {
    expect(severityFromSpeech('mission complete, severity four')).toBe(4);
    expect(severityFromSpeech('done')).toBeNull();
    expect(numberIn('received two hundred litres')).toBe(200);
    expect(parseCampCommand('received two hundred litres of water', inv)).toMatchObject({ item: 'Drinking water', delta: 200 });
  });
  test('camp commands', () => {
    expect(parseCampCommand('We distributed 40 food packets.', inv)).toMatchObject({ kind: 'stock', item: 'Food packets', delta: -40 });
    expect(parseCampCommand('Received 200 litres of water', inv)).toMatchObject({ kind: 'stock', item: 'Drinking water', delta: 200 });
    expect(parseCampCommand('Checked in twelve people', inv)).toEqual({ kind: 'occupancy', delta: 12 });
    expect(parseCampCommand('Fifteen people checked out', inv)).toEqual({ kind: 'occupancy', delta: -15 });
    expect(parseCampCommand('Gave 20 blankets to families', inv)).toMatchObject({ item: 'Blankets', delta: -20 });
    expect(parseCampCommand('We are running low, need resupply', inv)).toEqual({ kind: 'resupply' });
    expect(parseCampCommand('hello', inv)).toBeNull();
  });
});
