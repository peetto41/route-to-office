import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlacePicker from './PlacePicker.vue';
import type { GeocodeResponse, GeocodeResult } from '~/types/api';

const centralWorldMall: GeocodeResult = {
  lat: 13.7466,
  lng: 100.5393,
  formattedAddress: 'เซ็นทรัลเวิลด์ ถนนราชดำริ กรุงเทพฯ',
};

const centralWorldHospital: GeocodeResult = {
  lat: 13.72,
  lng: 100.52,
  formattedAddress: 'โรงพยาบาลเซ็นทรัลเวิลด์ (ตัวอย่าง) กรุงเทพฯ',
};

const okResponse: GeocodeResponse = { results: [centralWorldMall] };
const multiCandidateResponse: GeocodeResponse = {
  results: [centralWorldHospital, centralWorldMall],
};

async function typeAddress(wrapper: ReturnType<typeof mount>, value: string): Promise<void> {
  await wrapper.find('input').setValue(value);
}

describe('PlacePicker.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows "ใช้ตำแหน่งปัจจุบัน" for role="origin"', () => {
    const wrapper = mount(PlacePicker, {
      props: { role: 'origin', modelValue: null },
    });
    expect(wrapper.text()).toContain('ใช้ตำแหน่งปัจจุบัน');
  });

  it('does not show "ใช้ตำแหน่งปัจจุบัน" for role="destination"', () => {
    const wrapper = mount(PlacePicker, {
      props: { role: 'destination', modelValue: null },
    });
    expect(wrapper.text()).not.toContain('ใช้ตำแหน่งปัจจุบัน');
  });

  it('debounces the search box and calls GET /api/v1/geocode with the typed address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal('$fetch', fetchMock);

    const wrapper = mount(PlacePicker, {
      props: { role: 'origin', modelValue: null },
    });

    await typeAddress(wrapper, 'สยามพารากอน');

    // Not called yet — still within the debounce window.
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/geocode', { query: { address: 'สยามพารากอน' } });
    expect(wrapper.text()).toContain(okResponse.results[0]!.formattedAddress);
  });

  it('selecting a single search result emits update:modelValue with the resolved coordinates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal('$fetch', fetchMock);

    const wrapper = mount(PlacePicker, {
      props: { role: 'origin', modelValue: null },
    });

    await typeAddress(wrapper, 'สยามพารากอน');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    await wrapper.find('button.w-full').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([
      [{ lat: centralWorldMall.lat, lng: centralWorldMall.lng, label: centralWorldMall.formattedAddress }],
    ]);
  });

  it('renders all candidates as a pickable list rather than auto-selecting the first one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(multiCandidateResponse);
    vi.stubGlobal('$fetch', fetchMock);

    const wrapper = mount(PlacePicker, {
      props: { role: 'origin', modelValue: null },
    });

    await typeAddress(wrapper, 'Central World');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    // Nothing auto-selected — the query stays populated and no
    // update:modelValue has fired yet.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    const items = wrapper.findAll('li button');
    expect(items).toHaveLength(2);
    expect(wrapper.text()).toContain(centralWorldHospital.formattedAddress);
    expect(wrapper.text()).toContain(centralWorldMall.formattedAddress);

    // Picking the second (correct) candidate emits that one, not the first.
    await items[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([
      [{ lat: centralWorldMall.lat, lng: centralWorldMall.lng, label: centralWorldMall.formattedAddress }],
    ]);
  });

  it('shows the Thai "not found" fallback message on an empty results array, without crashing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ results: [] } satisfies GeocodeResponse);
    vi.stubGlobal('$fetch', fetchMock);

    const wrapper = mount(PlacePicker, {
      props: { role: 'destination', modelValue: null },
    });

    await typeAddress(wrapper, 'ที่อยู่ที่ไม่มีอยู่จริง');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(wrapper.text()).toContain('ไม่พบที่อยู่นี้ กรุณาลองพิมพ์ใหม่อีกครั้ง');
  });

  it('shows the Thai "not found" fallback message on a 404 without crashing', async () => {
    const notFoundError = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const fetchMock = vi.fn().mockRejectedValue(notFoundError);
    vi.stubGlobal('$fetch', fetchMock);

    const wrapper = mount(PlacePicker, {
      props: { role: 'destination', modelValue: null },
    });

    await typeAddress(wrapper, 'ที่อยู่ที่ไม่มีอยู่จริง');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(wrapper.text()).toContain('ไม่พบที่อยู่นี้ กรุณาลองพิมพ์ใหม่อีกครั้ง');
  });

  it('shows a generic Thai error fallback on a non-404 geocode failure, without crashing', async () => {
    const serverError = Object.assign(new Error('Internal Server Error'), { response: { status: 500 } });
    const fetchMock = vi.fn().mockRejectedValue(serverError);
    vi.stubGlobal('$fetch', fetchMock);

    const wrapper = mount(PlacePicker, {
      props: { role: 'destination', modelValue: null },
    });

    await typeAddress(wrapper, 'ที่อยู่ทดสอบ');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(wrapper.text()).toContain('เกิดข้อผิดพลาดในการค้นหาที่อยู่ กรุณาลองใหม่อีกครั้ง');
  });

  it('shows the location-denied fallback message for role="origin" when geoState is denied', () => {
    const wrapper = mount(PlacePicker, {
      props: {
        role: 'origin',
        modelValue: null,
        geoState: 'denied',
        geoErrorMessage: 'คุณปฏิเสธการเข้าถึงตำแหน่ง กรุณาพิมพ์ที่อยู่หรือคลิกบนแผนที่เพื่อระบุจุดเริ่มต้นแทน',
      },
    });

    expect(wrapper.text()).toContain('คุณปฏิเสธการเข้าถึงตำแหน่ง');
  });

  describe('directly-typed "lat, lng" input', () => {
    it('accepts a coordinate pair inside Thailand without calling GET /api/v1/geocode', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('$fetch', fetchMock);

      const wrapper = mount(PlacePicker, {
        props: { role: 'origin', modelValue: null },
      });

      await typeAddress(wrapper, '13.7563, 100.5018');
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('พิกัด: 13.7563, 100.5018');

      await wrapper.find('button.w-full').trigger('click');

      expect(wrapper.emitted('update:modelValue')).toEqual([
        [{ lat: 13.7563, lng: 100.5018, label: 'พิกัด: 13.7563, 100.5018' }],
      ]);
    });

    it('tolerates extra whitespace around the comma', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('$fetch', fetchMock);

      const wrapper = mount(PlacePicker, {
        props: { role: 'origin', modelValue: null },
      });

      await typeAddress(wrapper, '  13.7563   ,   100.5018  ');
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('พิกัด: 13.7563, 100.5018');
    });

    it('shows a Thai error message and rejects a coordinate pair outside Thailand', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('$fetch', fetchMock);

      const wrapper = mount(PlacePicker, {
        props: { role: 'origin', modelValue: null },
      });

      // Taipei, Taiwan — well outside the Thailand bounding box.
      await typeAddress(wrapper, '25.03, 121.5');
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('กรุณาระบุพิกัดภายในประเทศไทยเท่านั้น');
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });
  });
});
