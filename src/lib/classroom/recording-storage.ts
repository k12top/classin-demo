const ALIYUN_AGORA_STORAGE_REGIONS: Record<string, number> = {
  "oss-cn-shanghai": 1,
  "oss-ap-southeast-1": 10,
};

export function expectedAgoraRecordingStorageRegion(
  aliyunOssRegion: string,
): number | null {
  return ALIYUN_AGORA_STORAGE_REGIONS[aliyunOssRegion.trim()] ?? null;
}

export function validateAgoraRecordingStorageRegion(
  aliyunOssRegion: string,
  agoraStorageRegion: number,
) {
  const expected = expectedAgoraRecordingStorageRegion(aliyunOssRegion);
  return expected === null || expected === agoraStorageRegion;
}
