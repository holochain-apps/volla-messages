import { FileStorageClient } from "@holochain-open-dev/file-storage";
import type { RelayClient } from "./RelayClient";
import { FileStatus, type CellIdB64, type FileExtended } from "$lib/types";
import { decodeCellIdFromBase64 } from "$lib/utils";
import { decodeHashFromBase64, type EntryHashB64, type HoloHash } from "@holochain/client";
import {
  createGenericKeyValueStore,
  type GenericKeyValueStore,
} from "./generic/GenericKeyValueStore";
import { get } from "svelte/store";
import pRetry from "p-retry";

export interface FileStore extends GenericKeyValueStore<FileExtended> {
  upload: (cellIdB64: CellIdB64, file: File) => Promise<HoloHash>;
  download: (cellIdB64: CellIdB64, entryHashB64: EntryHashB64) => Promise<void>;
}

export function createFileStore(client: RelayClient): FileStore {
  const data = createGenericKeyValueStore<FileExtended>();

  async function upload(cellIdB64: CellIdB64, file: File) {
    const fileStorageClient = new FileStorageClient(
      client.client,
      // this is not used when cellId is specified, but the FileStorageClient still requires the parameter
      "UNUSED ROLE NAME",
      "file_storage",
      decodeCellIdFromBase64(cellIdB64),
    );
    return fileStorageClient.uploadFile(file);
  }

  async function download(cellIdB64: CellIdB64, entryHashB64: EntryHashB64) {
    const d = get(data);
    if (
      d.data[entryHashB64] !== undefined &&
      d.data[entryHashB64].file !== undefined &&
      d.data[entryHashB64].status === FileStatus.Loaded
    )
      return;

    // save loading status to writable
    data.update((c) => ({
      ...c,
      [entryHashB64]: {
        file: undefined,
        status: FileStatus.Loading,
      },
    }));

    // fetch file, with up to 10 retries
    const fileStorageClient = new FileStorageClient(
      client.client,
      // this is not used when cellId is specified, but the FileStorageClient still requires the parameter
      "UNUSED ROLE NAME",
      "file_storage",
      decodeCellIdFromBase64(cellIdB64),
    );

    // Download image file, retrying up to 10 times if download fails
    try {
      const file = await pRetry(
        () => fileStorageClient.downloadFile(decodeHashFromBase64(entryHashB64)),
        {
          retries: 10,
          minTimeout: 1000,
          maxTimeout: 10000,
          factor: 2,
          onFailedAttempt: (e) => {
            console.error(
              `Failed attempt ${e.attemptNumber} to download file from hash ${entryHashB64}`,
              e,
            );
            if (e.retriesLeft === 0)
              throw new Error("Failed to download file after 10 retries, giving up.");
          },
        },
      );

      // save to writable
      data.update((c) => ({
        ...c,
        [entryHashB64]: {
          file,
          status: FileStatus.Loaded,
        },
      }));
    } catch (e) {
      // save error status to writable
      data.update((c) => ({
        ...c,
        [entryHashB64]: {
          file: undefined,
          status: FileStatus.Error,
        },
      }));
    }
  }

  return {
    ...data,
    upload,
    download,
  };
}

export function deriveCellFileStore(fileStore: FileStore, key: CellIdB64) {
  return {
    ...fileStore,
    upload: (file: File) => fileStore.upload(key, file),
    download: (entryHashB64: EntryHashB64) => fileStore.download(key, entryHashB64),
  };
}
