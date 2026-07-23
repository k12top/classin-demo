/**
 * Default media profiles for the flexible classroom.
 *
 * Adjust these values to tune bandwidth and video quality for every newly
 * launched classroom. Existing classroom sessions keep their launch-time
 * settings until they rejoin.
 */
export const classroomMediaOptions = {
  // Grid / thumbnail video. Keep this low so multi-user classrooms use less
  // downstream bandwidth.
  lowStreamCameraEncoderConfiguration: {
    width: 320,
    height: 180,
    frameRate: 15,
    bitrate: 140,
  },

  // Used when the classroom focuses a participant and switches that stream to
  // its high-quality track.
  cameraEncoderConfiguration: {
    width: 640,
    height: 480,
    frameRate: 15,
    bitrate: 600,
  },

  // Screen sharing is normally the focused classroom content, so publish it
  // at a large profile to keep text and slides readable.
  screenShareEncoderConfiguration: {
    width: 1280,
    height: 720,
    frameRate: 15,
    bitrate: 1200,
  },
} as const;
