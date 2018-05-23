/**
 * @author clzhu
 * @createtime 2018/5/22 15:40
 * @description
 */
import {BaseLoader, LoaderStatus, LoaderErrors} from './loader.js';
import {RuntimeException} from '../utils/exception.js';

/**
 * 集成 QVBP2P 的loader
 *
 * 关于回退的说明, qvbp2p.rollback和 TLoader中onStateChange调用的_rollback方法实现其中一个即可, 但请务必实现其中的一个
 *
 * 触发的顺序为: 如果绑定了qvbp2p.rollback, 则sdk会调用这个方法, 否则的话, 会触发onStateChange事件
 */
class QVBP2PLoader extends BaseLoader {

    static isSupported() {
        let ql = window.qvbp2p;
        if (ql) {
            return ql.supportLoader;
        } else {
            if (window.QVBP2P) {
                return window.QVBP2P.isSupported();
            }
            return false;
        }
    }

    constructor(seekHandler, config) {
        super('qvb-p2p-loader');
        this.TAG = 'QVBP2PLoader';

        this._seekHandler = seekHandler;
        this._config = config;
        this._needStash = false;
        this._requestAbort = false;
        this._contentLength = null;
        this._receivedLength = 0;
    }

    destroy() {
        super.destroy();
        this._destroyQVBP2P();
    }

    abort() {
        this._requestAbort = true;
        this._status = LoaderStatus.kComplete;
    }

    _initQVBP2P() {
        if (!window.qvbp2p) {
            window.qvbp2p = new window.QVBP2P(this._config.p2pOptions);
            // 绑定回退方法
            if (this._config.rollback) {
                window.qvbp2p.rollback = this._config.rollback;
            }
            if (this.player) {
                window.qvbp2p.player = this.player;
            }
        }
    }

    _destroyQVBP2P() {
        if (window.qvbp2p) {
            window.qvbp2p.destroy();
            window.qvbp2p = null;
        }
    }

    open(dataSource, range) {
        if (window.qvbp2p) {
            this._destroyQVBP2P();
        }
        if (!window.qvbp2p) {
            this._initQVBP2P();
        }
        let sourceURL = dataSource.url;
        window.qvbp2p.loadSource({ videoId: this._config.videoId, src: sourceURL });
        this._bindInterface();
    }

    _bindInterface() {
        this._status = LoaderStatus.kBuffering;
        let tl = window.qvbp2p,
            TL = window.QVBP2P;
        tl.listen(TL.ComEvents.STATE_CHANGE, this.onStateChange.bind(this));
    }

    onStateChange(event, data) {
        let CODE = window.QVBP2P.ComCodes;
        let code = data.code;
        switch (code) {
            // 接收数据
            case CODE.RECEIVE_BUFFER:
                this._receiveBuffer(data);
                break;
                // 回退
            case CODE.ROLLBACK:
                this._rollback(data.player);
                break;
            default:
                break;
        }
    }

    _receiveBuffer(data) {
        if (this._requestAbort) {
            return;
        }

        if (data.payload instanceof ArrayBuffer) {
            if (this._contentLength === null) {
                if (data.payload !== null && data.payload !== 0) {
                    this._contentLength = data.payload.byteLength;
                    if (this._onContentLengthKnown) {
                        this._onContentLengthKnown(this._contentLength);
                    }
                }
            }
            this._dispatchArrayBuffer(data.payload);
        } else {
            this._status = LoaderStatus.kBuffering;
            let errInfo = {
                code: -1,
                msg: `${this.TAG} receive buffer is not instanceof ArrayBuffer`
            };
            if (this._onError) {
                this._onError(LoaderErrors.EXCEPTION, errInfo);
            } else {
                throw new RuntimeException(errInfo.msg);
            }
        }
    }

    _bufferEof() {
        this._status = LoaderStatus.kComplete;
    }

    _httpStatusCodeInvalid(data) {
        this._status = LoaderStatus.kError;
        if (this._onError) {
            this._onError(LoaderErrors.HTTP_STATUS_CODE_INVALID, { code: data.statusCode, msg: data.statusText });
        } else {
            throw new RuntimeException('TLoader: Http code invalid, ' + data.statusCode + ' ' + data.statusText);
        }
    }

    /**
   * p2p回退
   * @param player 播放器实例引用, 如果您没有调用qvbp2p.player = xxx, 则这个参数为undefined
   * @private
   */
    _rollback(player) {
        // 请自行实现回退
    }

    _dispatchArrayBuffer(arraybuffer) {
        let chunk = arraybuffer;
        let byteStart = this._receivedLength;
        this._receivedLength += chunk.byteLength;

        if (this._onDataArrival) {
            this._onDataArrival(chunk, byteStart, this._receivedLength);
        }
    }
}

export default QVBP2PLoader;