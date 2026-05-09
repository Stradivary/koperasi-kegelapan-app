/**
 * Web NFC Integration Layer
 *
 * Client-side library for NFC card read/write operations using the
 * Web NFC API. Provides the full pipeline for card operations:
 * read → decrypt → verify → process → encrypt → write.
 */

export { isNfcSupported, readNfcCard } from './reader.ts'
export { writeNfcCard } from './writer.ts'
export { handleWriteFailure, safeWrite } from './safety.ts'
export { executeCardPipeline } from './pipeline.ts'

export type {
  NDEFReader,
  NDEFReaderConstructor,
  NDEFReadingEvent,
  NDEFMessage,
  NDEFRecord,
  NDEFRecordInit,
  NDEFMessageInit,
  NDEFWriteOptions,
  NDEFScanOptions,
  NfcReadResult,
  NfcWriteResult,
  NfcErrorCode,
  CardOperationFn,
  CardCryptoKeys,
  PipelineResult,
} from './types.ts'
