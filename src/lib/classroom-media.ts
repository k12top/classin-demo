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
    width: 160,
    height: 120,
    frameRate: 15,
    bitrate: 65,
  },

  // Used when the classroom focuses a participant and switches that stream to
  // its high-quality track.
  cameraEncoderConfiguration: {
    width: 640,
    height: 480,
    frameRate: 15,
    bitrate: 600,
  },

  // Kept low by default to match the requested bandwidth-saving policy.
  screenShareEncoderConfiguration: {
    width: 160,
    height: 120,
    frameRate: 15,
    bitrate: 65,
  },
} as const;
