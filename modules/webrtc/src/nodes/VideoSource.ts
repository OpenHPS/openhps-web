/// <reference types="webrtc" />

import { SourceNode, SourceNodeOptions, TimeService, TimeUnit } from '@openhps/core';
import { CameraObject, VideoFrame } from '@openhps/video';

export class VideoSource extends SourceNode<VideoFrame<ImageData>> {
    protected options: VideoSourceOptions;
    protected timer: NodeJS.Timer;
    protected srcFPS: number;
    protected frame = 0;
    protected start: number;
    protected totalFrames: number;

    protected stream: MediaStream;
    protected video: HTMLVideoElement;
    protected canvas: HTMLCanvasElement;
    protected context: CanvasRenderingContext2D;

    constructor(options?: VideoSourceOptions) {
        super(options);
        this.options.source = this.options.source || new CameraObject(this.uid, undefined);
        this.once('build', this._onBuild.bind(this));
        this.once('destroy', this.stop.bind(this));
    }

    private getUserMedia(): (constraints: MediaStreamConstraints) => Promise<MediaStream> {
        if (navigator.mediaDevices) {
            return (constraints) => navigator.mediaDevices.getUserMedia(constraints);
        } else {
            const getUserMedia: any =
                navigator.getUserMedia ||
                navigator.webkitGetUserMedia ||
                navigator.mozGetUserMedia ||
                navigator.msGetUserMedia;
            if (this.getUserMedia === undefined) {
                throw new Error(`getUserMedia is not supported by the browser!`);
            }
            return (constraints) =>
                new Promise((resolve, reject) => {
                    getUserMedia.call(navigator, constraints, resolve, reject);
                });
        }
    }

    private _onBuild(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.getUserMedia();
            // Create a canvas element
            if (this.options.canvas) {
                if (typeof this.options.canvas === 'string') {
                    this.canvas = document.getElementById(this.options.canvas) as HTMLCanvasElement;
                } else {
                    this.canvas = this.options.canvas;
                }
            } else {
                this.canvas = document.createElement('canvas');
                this.canvas.id = `_OpenHPS-${this.uid}`;
                this.canvas.setAttribute('style', 'display: none');
            }
            // Get canvas context
            this.context = this.canvas.getContext('2d');

            if (this.options.videoSource) {
                this.load(this.options.videoSource)
                    .then(() => {
                        if (this.options.autoPlay) {
                            this.play();
                        }
                        resolve();
                    })
                    .catch(reject);
            } else {
                resolve();
            }
        });
    }

    reset(): void {
        this.frame = 0;
    }

    /**
     * Start playback of the video stream
     * @returns {number} Running frame grab timer
     */
    play(): NodeJS.Timer {
        let ready = false;
        if (this.video) {
            this.video
                .play()
                .then(() => {
                    ready = true;
                })
                .catch((err) => {
                    this.logger('error', err.name + ' : ' + err.message, err);
                });
        } else {
            throw new Error(`No video source loaded!`);
        }
        this.timer = setInterval(
            () => {
                if (ready || !this.options.throttleRead) {
                    ready = false;
                    this._readFrame()
                        .then((videoFrame: VideoFrame) => {
                            if (!videoFrame) {
                                return clearInterval(this.timer as any);
                            }
                            if (!this.options.throttlePush) {
                                ready = true;
                            }
                            return this.push(videoFrame);
                        })
                        .then(() => {
                            if (this.options.throttlePush) {
                                ready = true;
                            }
                        })
                        .catch((ex) => {
                            this.logger('error', 'Unable to read video frame!', ex);
                        });
                }
            },
            this.options.fps === -1 ? 0 : 1000 / this.options.fps,
        );
        this.start = Date.now();
        return this.timer;
    }

    stop(): void {
        this.pause();
        if (this.stream) {
            this.stream.getTracks().forEach((t) => {
                t.stop();
            });
        }
    }

    pause(): void {
        this.video.pause();
        if (this.timer) {
            clearInterval(this.timer as any);
        }
    }

    get currentFrameCount(): number {
        return this.frame;
    }

    get totalFrameCount(): number {
        return this.totalFrames;
    }

    get actualFPS(): number {
        return Math.round((this.frame / ((Date.now() - this.start) / 1000)) * 100) / 100;
    }

    /**
     * Pull the next frame
     * @returns {Promise<VideoSource>} Pull promise
     */
    onPull(): Promise<VideoFrame> {
        return this._readFrame();
    }

    private _readFrame(): Promise<VideoFrame> {
        return new Promise((resolve, reject) => {
            const videoFrame = new VideoFrame();
            videoFrame.source = this.source as CameraObject;
            videoFrame.fps = this.options.fps;
            this.readFrame()
                .then((frameImage: ImageData) => {
                    if (!frameImage) {
                        return resolve(undefined);
                    }
                    this.frame++; // Increase frame
                    videoFrame.phenomenonTimestamp = TimeUnit.SECOND.convert(
                        this.frame * (1.0 / videoFrame.fps),
                        TimeService.getUnit(),
                    );
                    videoFrame.rows = this.options.height || frameImage.height;
                    videoFrame.cols = this.options.width || frameImage.width;
                    videoFrame.image = frameImage;
                    resolve(videoFrame);
                })
                .catch(reject);
        });
    }

    /**
     * Load video from file, stream, port
     * @param {string | HTMLVideoElement} videoSource File path
     * @returns {VideoSource} Video source instance
     */
    load(videoSource: string | HTMLVideoElement): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof videoSource === 'string') {
                this.video = document.getElementById(videoSource) as HTMLVideoElement;
            } else {
                this.video = videoSource;
            }
            this.getUserMedia()({
                video: {
                    facingMode: 'environment',
                    width: this.options.width,
                    height: this.options.height,
                    ...(this.options.fps ? { frameRate: { ideal: this.options.fps } } : {}),
                },
                audio: this.options.audio,
            })
                .then((stream: MediaStream) => {
                    this.logger('info', 'Video stream loaded', stream);
                    this.stream = stream;
                    this.video.srcObject = stream;
                    this.video.onloadedmetadata = () => {
                        this.options.height = this.video.videoHeight;
                        this.options.width = this.video.videoWidth;
                        this.canvas.width = this.video.videoWidth;
                        this.canvas.height = this.video.videoHeight;
                        resolve();
                    };
                })
                .catch((err) => {
                    this.logger('error', err.name + ': ' + err.message, err);
                    reject(err);
                });
        });
    }

    protected readFrame(): Promise<ImageData> {
        return new Promise<ImageData>((resolve, reject) => {
            try {
                if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
                    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
                    const imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
                    resolve(imageData);
                } else {
                    resolve(undefined);
                }
            } catch (ex) {
                reject(ex);
            }
        });
    }
}

export interface VideoSourceOptions extends SourceNodeOptions, MediaTrackConstraintSet {
    /**
     * Autoplay the video when building the node
     */
    autoPlay?: boolean;
    videoSource?: string | HTMLVideoElement;
    canvas?: string | HTMLCanvasElement;
    /**
     * Playback frames per second
     */
    fps?: number;
    /**
     * Frame skipping
     */
    throttlePush?: boolean;
    throttleRead?: boolean;
    width?: number;
    height?: number;
    /**
     * Frames to skip
     * @default 1
     */
    frameSkip?: number;
    audio?: boolean;
}
