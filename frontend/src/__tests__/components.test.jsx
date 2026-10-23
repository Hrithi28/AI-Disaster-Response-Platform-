import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { connectionLevel } from '../context/LiveData';
import { SeverityBadge, StatusChip } from '../components/ui';
import { timeAgo } from '../lib/constants';

describe('UI building blocks', () => {
  it('SeverityBadge shows the label and score', () => {
    render(<SeverityBadge level={5} score={91.4} />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText(/91/)).toBeInTheDocument();
  });

  it('StatusChip maps resource statuses to readable labels', () => {
    render(<StatusChip status="dispatched" kind="resource" />);
    expect(screen.getByText('En route')).toBeInTheDocument();
  });

  it('connection level: online → LAN-only → offline', () => {
    expect(connectionLevel({ connected: true, browserOnline: true, connectivity: { internetAvailable: true } })).toBe('online');
    expect(connectionLevel({ connected: true, browserOnline: true, connectivity: { internetAvailable: false } })).toBe('lan');
    expect(connectionLevel({ connected: false, browserOnline: true, connectivity: null })).toBe('offline');
    // Wi-Fi off but the server is on this laptop: still usable, shown as LAN-only
    expect(connectionLevel({ connected: true, browserOnline: false, connectivity: { internetAvailable: false } })).toBe('lan');
  });

  it('timeAgo formats durations', () => {
    expect(timeAgo(new Date(Date.now() - 5000))).toBe('5s ago');
    expect(timeAgo(new Date(Date.now() - 3 * 60000))).toBe('3m ago');
  });
});
