// Empty module stub for agora-electron-sdk
// The Agora Classroom SDK internally tries to import agora-electron-sdk,
// which is a native Electron module not needed in Web (browser) builds.
// This empty module prevents Turbopack from failing on the import.
const emptyAgoraElectronModule = {};

export default emptyAgoraElectronModule;
