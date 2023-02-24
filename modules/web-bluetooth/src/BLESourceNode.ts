/// <reference types="web-bluetooth" />

import { SourceNode, SensorSourceOptions } from '@openhps/core';
import { BLEObject, MACAddress, RelativeRSSI, RFDataFrame } from '@openhps/rf';

/**
 * BLE source node using cordova-plugin-ibeacon.
 */
export class BLESourceNode extends SourceNode<RFDataFrame> {
    protected options: BLESourceNodeOptions;
    protected bluetooth: Bluetooth;
    protected scan: BluetoothLEScan;

    constructor(options?: BLESourceNodeOptions) {
        super(options);
        this.options.uuids = this.options.uuids || undefined;
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

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.bluetooth
                .requestLEScan({
                    acceptAllAdvertisements: true,
                    keepRepeatedDevices: true,
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
        const frame = new RFDataFrame();
        const object = new BLEObject(MACAddress.fromString(event.device.id));
        object.displayName = event.device.name;
        object.parseManufacturerData(Buffer.from(Object.values(event.manufacturerData)[0].buffer));
        frame.addObject(object);

        frame.source = this.source;
        frame.source.relativePositions.forEach((pos) => frame.source.removeRelativePositions(pos.referenceObjectUID));
        frame.source.addRelativePosition(new RelativeRSSI(object, event.rssi));
        this.push(frame);
    }
}

export interface BLESourceNodeOptions extends SensorSourceOptions {
    /**
     * List of UUIDs that should be included in the result scan.
     */
    uuids?: string[];
}
