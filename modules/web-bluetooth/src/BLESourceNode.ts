/// <reference types="web-bluetooth" />

import { SourceNode, SensorSourceOptions } from '@openhps/core';
import { BLEObject, RelativeRSSI, RFDataFrame } from '@openhps/rf';

/**
 * BLE source node using Web Bluetooth API
 */
export class BLESourceNode extends SourceNode<RFDataFrame> {
    protected options: BLESourceNodeOptions;
    protected bluetooth: Bluetooth;
    protected scan: BluetoothLEScan;

    constructor(options?: BLESourceNodeOptions) {
        super(options);
        this.options.source = this.options.source ?? new BLEObject().setUID(this.uid);

        this.once('build', this._onBleInit.bind(this));
        this.once('destroy', this.stop.bind(this));
    }

    private _onBleInit(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.bluetooth = navigator.bluetooth;
            if (!this.bluetooth || !this.bluetooth.requestLEScan) {
                return reject(new Error('Bluetooth scanning is not supported!'));
            }
            this.bluetooth.addEventListener('advertisementreceived', this.onAdvertisement.bind(this));
            resolve();
        });
    }

    static checkPermissions(): Promise<boolean> {
        return this.requestPermissions();
    }

    static requestPermissions(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            navigator.permissions
                .query({ name: 'bluetooth-le-scan' as PermissionName })
                .then((result) => {
                    if (result.state === 'granted') {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                })
                .catch(reject);
        });
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.bluetooth
                .requestLEScan({
                    acceptAllAdvertisements: true,
                    keepRepeatedDevices: true,
                    filters: this.options.filters,
                })
                .then((scan) => {
                    if (this.scan) {
                        this.scan.stop();
                    }
                    this.scan = scan;
                    resolve();
                })
                .catch(reject);
        });
    }

    stop(): void {
        if (this.scan) {
            this.scan.stop();
        }
    }

    onPull(): Promise<RFDataFrame> {
        return new Promise((resolve, reject) => {
            if (!this.start) {
                this.start()
                    .then(() => resolve(undefined))
                    .catch(reject);
            } else {
                resolve(undefined);
            }
        });
    }

    private onAdvertisement(event: BluetoothAdvertisingEvent): void {
        this.logger('debug', 'BLE Advertisement', event);

        const frame = new RFDataFrame();
        const object = new BLEObject();
        object.uid = event.device.id;
        object.displayName = event.device.name;

        const manufacturerData = Object.values(event.manufacturerData);
        if (manufacturerData.length > 0) {
            object.parseManufacturerData(manufacturerData[0].buffer);
        }
        frame.addObject(object);

        frame.source = this.source;
        frame.source.relativePositions.forEach((pos) => frame.source.removeRelativePositions(pos.referenceObjectUID));
        frame.source.addRelativePosition(new RelativeRSSI(object, event.rssi));
        this.push(frame);
    }
}

export interface BLESourceNodeOptions extends SensorSourceOptions {
    filters?: BluetoothLEScanFilter[] | undefined;
}
