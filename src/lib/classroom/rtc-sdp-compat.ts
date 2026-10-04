const AGORA_UNSUPPORTED_ICE_OPTION = "goog-sped-v1";

export function sanitizeAgoraIceOptions(sdp: string): string {
  return sdp.replace(/^a=ice-options:([^\r\n]*)$/gm, (line, raw: string) => {
    const options = raw
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .filter((option) => option !== AGORA_UNSUPPORTED_ICE_OPTION);
    return options.length ? `a=ice-options:${options.join(" ")}` : line;
  });
}

type PatchedPeerConnectionPrototype = RTCPeerConnection & {
  __classroomAgoraOfferPatched?: boolean;
};

function sanitizeGeneratedDescription(
  description: RTCSessionDescriptionInit,
): RTCSessionDescriptionInit {
  if (!description.sdp) return description;
  const sdp = sanitizeAgoraIceOptions(description.sdp);
  if (sdp === description.sdp) return description;
  return { ...description, sdp };
}

export function installAgoraSdpCompatibility(): void {
  if (
    typeof window === "undefined" ||
    typeof RTCPeerConnection === "undefined" ||
    typeof RTCSessionDescription === "undefined"
  ) {
    return;
  }

  const prototype = RTCPeerConnection.prototype as PatchedPeerConnectionPrototype;
  if (prototype.__classroomAgoraOfferPatched) return;

  // Agora parses the native offer/answer before setLocalDescription. Chromium
  // variants may append `goog-sped-v1`, which Agora's SDP parser rejects when
  // it follows the standard `trickle` option. Sanitize at the generation edge.
  const createOffer = prototype.createOffer as (
    this: RTCPeerConnection,
    options?: RTCOfferOptions,
  ) => Promise<RTCSessionDescriptionInit>;
  const createAnswer = prototype.createAnswer as (
    this: RTCPeerConnection,
    options?: RTCAnswerOptions,
  ) => Promise<RTCSessionDescriptionInit>;
  prototype.createOffer = function (
    this: RTCPeerConnection,
    options?: RTCOfferOptions,
  ) {
    return createOffer.call(this, options).then(sanitizeGeneratedDescription);
  } as RTCPeerConnection["createOffer"];
  prototype.createAnswer = function (
    this: RTCPeerConnection,
    options?: RTCAnswerOptions,
  ) {
    return createAnswer.call(this, options).then(sanitizeGeneratedDescription);
  } as RTCPeerConnection["createAnswer"];
  prototype.__classroomAgoraOfferPatched = true;
}
