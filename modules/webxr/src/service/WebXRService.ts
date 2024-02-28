/// <reference types="webxr" />

import { Service } from '@openhps/core';

/**
 * WebXR service
 */
export class WebXRService extends Service {
    private _session: XRSession = null;
    protected options: WebXRServiceOptions;
    glBinding: XRWebGLBinding;

    constructor(options?: WebXRServiceOptions) {
        super();
        this.options = options || {};
        this.options.autoStart = this.options.autoStart === undefined ? false : this.options.autoStart;
        this.options.requiredFeatures = this.options.requiredFeatures || [
            'local',
            'hit-test',
            'camera-access',
            'depth-sensing',
            'dom-overlay',
        ];

        if (!this.options.gl) {
            let canvas = document.createElement('canvas');
            if (this.options.canvas) {
                if (typeof this.options.canvas === 'string') {
                    canvas = document.getElementById(this.options.canvas) as HTMLCanvasElement;
                } else {
                    canvas = this.options.canvas;
                }
            } else {
                document.body.appendChild(canvas);
            }
            this.options.gl = canvas.getContext('webgl', { xrCompatible: true }) as WebGLRenderingContext;
        }

        if (this.options.autoStart) {
            this.once('build', this._onBuild.bind(this));
        }
    }

    private _onBuild(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.createSession()
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }

    /**
     * Create a new XR session
     *
     * @returns {Promise<XRSession>} XR session promise
     */
    createSession(): Promise<XRSession> {
        return new Promise((resolve, reject) => {
            if (!navigator.xr) {
                return reject(new Error('WebXR is not supported!'));
            }
            navigator.xr
                .requestSession('immersive-ar', {
                    requiredFeatures: this.options.requiredFeatures,
                    depthSensing: {
                        usagePreference: ['cpu-optimized', 'gpu-optimized'],
                        dataFormatPreference: ['luminance-alpha', 'float32'],
                    },
                    domOverlay: { root: document.body },
                })
                .then((session: XRSession) => {
                    this._session = session;
                    this.glBinding = new XRWebGLBinding(session, this.gl);
                    this._session.updateRenderState({
                        baseLayer: new XRWebGLLayer(this._session, this.gl),
                    });
                    resolve(session);
                })
                .catch(reject);
        });
    }

    get session(): XRSession {
        return this._session;
    }

    get gl(): WebGLRenderingContext {
        return this.options.gl;
    }
}

export interface WebXRServiceOptions {
    autoStart?: boolean;
    gl?: WebGLRenderingContext;
    canvas?: HTMLCanvasElement | string;
    requiredFeatures?: string[];
}
