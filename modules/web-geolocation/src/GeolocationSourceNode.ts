import {
    DataFrame,
    SourceNode,
    GeographicalPosition,
    SensorSourceOptions,
    LinearVelocity,
    Orientation,
    AngleUnit,
    Accuracy2D,
    LengthUnit,
    DataObject,
} from '@openhps/core';

/**
 * Geolocation source node
 */
export class GeolocationSourceNode extends SourceNode<DataFrame> {
    protected options: GeolocationSourceOptions;
    private _watchId: number;
    protected geolocation: Geolocation;

    constructor(options?: SensorSourceOptions) {
        super(options);
        this.options.interval = this.options.interval || 1000;
        if (this.options.autoStart) {
            this.once('build', this.start.bind(this));
        }
        this.options.source = this.source ?? new DataObject();
    }

    start(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.geolocation = navigator.geolocation;
            this.geolocation.watchPosition(
                (position) => {
                    const geoPos = this._convertPosition(position);
                    this.source.setPosition(geoPos);
                    this.push(new DataFrame(this.source));
                },
                (error) => {
                    this.logger('error', 'Unable to watch for position changes!', error as any);
                    reject(error);
                },
                {
                    maximumAge: this.options.interval,
                    timeout: this.options.timeout,
                    enableHighAccuracy: true,
                },
            );
            resolve();
        });
    }

    private _convertPosition(position: GeolocationPosition): GeographicalPosition {
        const geoPos = new GeographicalPosition();
        geoPos.accuracy = new Accuracy2D(position.coords.accuracy, position.coords.altitudeAccuracy, LengthUnit.METER);
        geoPos.altitude = position.coords.altitude;
        geoPos.latitude = position.coords.latitude;
        geoPos.longitude = position.coords.longitude;
        geoPos.linearVelocity = new LinearVelocity(position.coords.speed);
        geoPos.orientation = Orientation.fromEuler({
            yaw: position.coords.heading,
            pitch: 0,
            roll: 0,
            unit: AngleUnit.DEGREE,
        });
        return geoPos;
    }

    stop(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.geolocation.clearWatch(this._watchId);
            resolve();
        });
    }

    onPull(): Promise<DataFrame> {
        return new Promise<DataFrame>((resolve, reject) => {
            this.geolocation.getCurrentPosition(
                (position) => {
                    const geoPos = this._convertPosition(position);
                    this.source.setPosition(geoPos);
                    resolve(new DataFrame(this.source));
                },
                (error) => reject(error),
                {
                    enableHighAccuracy: true,
                    timeout: this.options.timeout,
                    maximumAge: this.options.timeout,
                },
            );
        });
    }
}

export interface GeolocationSourceOptions extends SensorSourceOptions {
    timeout?: number;
}
