import { useState, useEffect } from 'react';

export function useChromecast() {
    const [castDevices, setCastDevices] = useState(['None']);
    const [selectedCastDevice, setSelectedCastDevice] = useState('None');
    const [availableIps, setAvailableIps] = useState([]);
    const [selectedProxyIp, setSelectedProxyIp] = useState('');

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
        setSelectedProxyIp
    };
}
