import { SourceNode, Absolute3DPosition, SourceNodeOptions, LengthUnit } from '@openhps/core';
import { CameraObject, ColorOrder } from '@openhps/video';
import { XRDataFrame } from '../../data/XRDataFrame';
import { WebXRService } from '../../service/WebXRService';

/**
 * WebXR source node
 */
export class XRSource extends SourceNode<XRDataFrame> {
    private _refSpace: XRReferenceSpace = null;
    private _service: WebXRService = null;
    protected options: XRSourceOptions;

    constructor(options?: XRSourceOptions) {
        super(options);
        this.options.source = this.options.source || new CameraObject(this.uid);
        this.options.output = this.options.output === undefined ? true : this.options.output;

        this.on('build', this._initReferenceSpace.bind(this));
        this.once('destroy', this._onDestroy.bind(this));
    }

    protected get source(): CameraObject {
        return super.source as CameraObject;
    }

    private _initReferenceSpace(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._service = this.model.findService<WebXRService>('WebXRService');
            if (this._service === undefined || this._service === null) {
                return reject(new Error(`WebXR service was not added to model!`));
            }

            // Request local reference spaces at the time this session was created
            this._service.session.requestReferenceSpace('local').then((refSpace: XRReferenceSpace) => {
                this.logger('debug', 'Local reference space created. Starting animation frames ...');
                this._refSpace = refSpace;

                this._service.session.requestAnimationFrame(this._onXRFrame.bind(this));
            });

            resolve();
        });
    }

    private _onDestroy(): Promise<void> {
        return new Promise((resolve) => {
            this._service.session.end();
            resolve();
        });
    }

    private _onXRFrame(time: number, frame: XRFrame): void {
        const pose: XRViewerPose = frame.getViewerPose(this._refSpace);
        const gl = this._service.gl;

        if (pose) {
            // Create XR Data Frame
            const dataFrame = new XRDataFrame();
            dataFrame.source = this.source.clone();
            dataFrame.source.colorOrder = ColorOrder.RGBA;

            // Get camera view
            for (const view of pose.views) {
                const session = this._service.session;
                const baseLayer = session.renderState.baseLayer;
                const viewport = baseLayer.getViewport(view);
                gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
                const depthData = frame.getDepthInformation(view);
                const image = this._service.glBinding.getCameraImage(view.camera);
                dataFrame.depth = depthData;
                dataFrame.texture = image;
                dataFrame.height = view.camera.height;
                dataFrame.width = view.camera.width;
                dataFrame.source.width = view.camera.width;
                dataFrame.source.height = view.camera.height;
                if (this.options.includeImage) {
                    // Create a new framebuffer for the image
                    const framebuffer = gl.createFramebuffer();
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dataFrame.texture, 0);

                    // Read the contents of the framebuffer
                    const data = new Uint8Array(dataFrame.width * dataFrame.height * 4);
                    gl.readPixels(0, 0, dataFrame.width, dataFrame.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
                    dataFrame.image = data;
                }
                break; // Do not get other poses?
            }

            if (this.options.output) {
                this._service.gl.bindFramebuffer(
                    this._service.gl.FRAMEBUFFER,
                    frame.session.renderState.baseLayer.framebuffer,
                );
            }

            const matrix: Float32Array = pose.transform.matrix;
            const xrPosition: DOMPointReadOnly = pose.transform.position;

            // Set DOMPoint position to camera source
            const position: Absolute3DPosition = new Absolute3DPosition(xrPosition.x, xrPosition.y, xrPosition.z);
            // TODO: Handle accuracy based on the emulated position
            if (pose.emulatedPosition) {
                position.setAccuracy(100, LengthUnit.CENTIMETER);
            }
            this.source.position = position;

            dataFrame.createdTimestamp = time; // Creation timestamp based on the XR frame
            dataFrame.viewerPose = matrix;
            dataFrame.rawFrame = frame;
            dataFrame.source = this.source;
            dataFrame.refSpace = this._refSpace;

            this.push(dataFrame).then(() => {
                frame.session.requestAnimationFrame(this._onXRFrame.bind(this));
            });
        } else {
            // No viewer pose detected, request new animation frame
            frame.session.requestAnimationFrame(this._onXRFrame.bind(this));
        }
    }

    public onPull(): Promise<XRDataFrame> {
        return new Promise<XRDataFrame>((resolve) => {
            if (this._service.session !== null) {
                this._service.session.requestAnimationFrame(this._onXRFrame.bind(this));
            }
            resolve(undefined);
        });
    }
}

export interface XRSourceOptions extends SourceNodeOptions {
    /**
     * Include raw image in XRDataFrame
     */
    includeImage?: boolean;
    /**
     * Show the output in the frame buffer
     *
     * @default true
     */
    output?: boolean;
}
