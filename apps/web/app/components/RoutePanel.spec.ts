import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RoutePanel from './RoutePanel.vue';
import type { RouteResponse } from '~/types/api';

const routeResponse: RouteResponse = {
  distanceMeters: 12_345,
  durationSeconds: 1_800,
  arrivalTime: '2026-09-18T09:00:00.000Z',
  route: {
    type: 'LineString',
    coordinates: [
      [100.5, 13.7],
      [100.6, 13.8],
    ],
  },
  bounds: [
    [100.5, 13.7],
    [100.6, 13.8],
  ],
  steps: [],
};

describe('RoutePanel.vue', () => {
  it('shows a loading state while the route is being fetched', () => {
    const wrapper = mount(RoutePanel, { props: { route: null, loading: true, error: null } });
    expect(wrapper.text()).toContain('กำลังค้นหาเส้นทาง');
  });

  it('shows the Thai error message when the fetch failed', () => {
    const wrapper = mount(RoutePanel, {
      props: { route: null, loading: false, error: 'ไม่สามารถค้นหาเส้นทางได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง' },
    });
    expect(wrapper.text()).toContain('ไม่สามารถค้นหาเส้นทางได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
  });

  it('shows a prompt when there is no route yet and no error/loading', () => {
    const wrapper = mount(RoutePanel, { props: { route: null, loading: false, error: null } });
    expect(wrapper.text()).toContain('เลือกจุดเริ่มต้นและจุดหมายปลายทาง');
  });

  it('formats distanceMeters, durationSeconds, and arrivalTime from the response as-is', () => {
    const wrapper = mount(RoutePanel, { props: { route: routeResponse, loading: false, error: null } });
    const text = wrapper.text();

    // distanceMeters: 12345 -> 12.3 km
    expect(text).toContain('12.3');
    expect(text).toContain('กม.');

    // durationSeconds: 1800 -> 30 minutes
    expect(text).toContain('30');
    expect(text).toContain('นาที');

    // arrivalTime rendered from the server-supplied ISO string, not recomputed.
    const expectedArrival = new Intl.DateTimeFormat('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    }).format(new Date(routeResponse.arrivalTime));
    expect(text).toContain(expectedArrival);
  });

  it('never references a durationInTrafficSeconds field (removed — this is a typical-speed estimate, not live traffic)', () => {
    const wrapper = mount(RoutePanel, { props: { route: routeResponse, loading: false, error: null } });
    expect(wrapper.html()).not.toContain('durationInTraffic');
    expect(wrapper.text()).not.toMatch(/traffic/i);

    // Regression guard at the source level too — not just the rendered DOM —
    // so a future edit that reintroduces the field anywhere in the component
    // (even unused, or behind a v-if that happens not to trigger above) fails
    // this test.
    const source = readFileSync(resolve(__dirname, './RoutePanel.vue'), 'utf-8');
    expect(source).not.toContain('durationInTraffic');
  });
});
