import { useState, useEffect } from 'react';

const TRANSCODER_DEFAULTS = {
    enabled: false,
    intelligent: true,
    preset: 'ultrafast',
    tune: 'zerolatency',
    hls_time: 4,
    hls_list_size: 6,
    ladder: [
        { id: 'v0', res: '1920:1080', bitrate: '6000k', level: '4.0' },
        { id: 'v1', res: '1280:720', bitrate: '3000k', level: '3.1' }
    ]
};

export function useChromecast() {
    const [castDevices, setCastDevices] = useState(['None']);
    const [selectedCastDevice, setSelectedCastDevice] = useState('None');
    const [availableIps, setAvailableIps] = useState([]);
    const [selectedProxyIp, setSelectedProxyIp] = useState('');
    const [transcoderSettings, setTranscoderSettings] = useState(TRANSCODER_DEFAULTS);

    useEffect(() => {
        const initChromecast = async () => {
            if (window.api.onCastDeviceFound) {
                window.api.onCastDeviceFound((name) => {
                    setCastDevices(prev => {
                        if (prev.includes(name)) return prev;
                        const next = [...prev.filter(d => d !== 'None'), name];
                        setSelectedCastDevice(current => {
                            if (!current || current === 'None') return name;
                            return current;
                        });
                        return next;
                    });
                });
                window.api.castScan();
            }

            if (window.api.getAvailableIps) {
                const ips = await window.api.getAvailableIps();
                setAvailableIps(ips);
                if (ips.length > 0) setSelectedProxyIp(ips[0]);
            }
        };

        initChromecast();
    }, []);

    return {
        castDevices,
        selectedCastDevice,
        setSelectedCastDevice,
        availableIps,
        selectedProxyIp,
        setSelectedProxyIp,
        transcoderSettings,
        setTranscoderSettings
    };
}
