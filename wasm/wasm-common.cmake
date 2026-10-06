# Shared exported functions and flags for sherpa-onnx WASM builds.
# Include this file from wasm/nodejs/CMakeLists.txt and wasm/web/CMakeLists.txt.

set(exported_functions
  #tts
  PrintOfflineTtsConfig
  SherpaOnnxCreateOfflineTts
  SherpaOnnxDestroyOfflineTts
  SherpaOnnxDestroyOfflineTtsGeneratedAudio
  SherpaOnnxOfflineTtsGenerate
  SherpaOnnxOfflineTtsGenerateWithCallback
  SherpaOnnxOfflineTtsGenerateWithConfig
  SherpaOnnxOfflineTtsNumSpeakers
  SherpaOnnxOfflineTtsSampleRate
  SherpaOnnxWriteWave
  # streaming asr
  SherpaOnnxCreateOnlineRecognizer
  SherpaOnnxCreateOnlineStream
  SherpaOnnxDecodeOnlineStream
  SherpaOnnxDestroyOnlineRecognizer
  SherpaOnnxDestroyOnlineRecognizerResult
  SherpaOnnxDestroyOnlineStream
  SherpaOnnxDestroyOnlineStreamResultJson
  SherpaOnnxGetOnlineStreamResult
  SherpaOnnxGetOnlineStreamResultAsJson
  SherpaOnnxIsOnlineStreamReady
  SherpaOnnxOnlineStreamAcceptWaveform
  SherpaOnnxOnlineStreamGetOption
  SherpaOnnxOnlineStreamInputFinished
  SherpaOnnxOnlineStreamIsEndpoint
  SherpaOnnxOnlineStreamReset
  SherpaOnnxOnlineStreamSetOption
  # non-streaming ASR
  PrintOfflineRecognizerConfig
  SherpaOnnxAcceptWaveformOffline
  SherpaOnnxCreateOfflineRecognizer
  SherpaOnnxCreateOfflineStream
  SherpaOnnxDecodeMultipleOfflineStreams
  SherpaOnnxDecodeOfflineStream
  SherpaOnnxDestroyOfflineRecognizer
  SherpaOnnxDestroyOfflineRecognizerResult
  SherpaOnnxDestroyOfflineStream
  SherpaOnnxDestroyOfflineStreamResultJson
  SherpaOnnxGetOfflineStreamResult
  SherpaOnnxGetOfflineStreamResultAsJson
  SherpaOnnxOfflineStreamGetOption
  SherpaOnnxOfflineStreamSetOption
  SherpaOnnxOfflineRecognizerSetConfig
  # online kws
  SherpaOnnxCreateKeywordSpotter
  SherpaOnnxCreateKeywordStream
  SherpaOnnxDecodeKeywordStream
  SherpaOnnxDestroyKeywordResult
  SherpaOnnxDestroyKeywordSpotter
  SherpaOnnxGetKeywordResult
  SherpaOnnxIsKeywordStreamReady
  SherpaOnnxResetKeywordStream
  # VAD
  SherpaOnnxCreateCircularBuffer
  SherpaOnnxDestroyCircularBuffer
  SherpaOnnxCircularBufferPush
  SherpaOnnxCircularBufferGet
  SherpaOnnxCircularBufferFree
  SherpaOnnxCircularBufferPop
  SherpaOnnxCircularBufferSize
  SherpaOnnxCircularBufferHead
  SherpaOnnxCircularBufferReset
  SherpaOnnxCreateVoiceActivityDetector
  SherpaOnnxDestroyVoiceActivityDetector
  SherpaOnnxVoiceActivityDetectorAcceptWaveform
  SherpaOnnxVoiceActivityDetectorEmpty
  SherpaOnnxVoiceActivityDetectorDetected
  SherpaOnnxVoiceActivityDetectorPop
  SherpaOnnxVoiceActivityDetectorClear
  SherpaOnnxVoiceActivityDetectorFront
  SherpaOnnxDestroySpeechSegment
  SherpaOnnxVoiceActivityDetectorReset
  SherpaOnnxVoiceActivityDetectorFlush
  # Speaker diarization
  SherpaOnnxCreateOfflineSpeakerDiarization
  SherpaOnnxDestroyOfflineSpeakerDiarization
  SherpaOnnxOfflineSpeakerDiarizationDestroyResult
  SherpaOnnxOfflineSpeakerDiarizationDestroySegment
  SherpaOnnxOfflineSpeakerDiarizationGetSampleRate
  SherpaOnnxOfflineSpeakerDiarizationProcess
  SherpaOnnxOfflineSpeakerDiarizationProcessWithCallback
  SherpaOnnxOfflineSpeakerDiarizationResultGetNumSegments
  SherpaOnnxOfflineSpeakerDiarizationResultSortByStartTime
  SherpaOnnxOfflineSpeakerDiarizationSetConfig
  #
  SherpaOnnxFileExists
  SherpaOnnxReadWave
  SherpaOnnxReadWaveFromBinaryData
  SherpaOnnxFreeWave
  SherpaOnnxWriteWave
  # speech enhancement
  SherpaOnnxCreateOfflineSpeechDenoiser
  SherpaOnnxCreateOnlineSpeechDenoiser
  SherpaOnnxDestroyDenoisedAudio
  SherpaOnnxDestroyOfflineSpeechDenoiser
  SherpaOnnxDestroyOnlineSpeechDenoiser
  SherpaOnnxOfflineSpeechDenoiserGetSampleRate
  SherpaOnnxOfflineSpeechDenoiserRun
  SherpaOnnxOnlineSpeechDenoiserGetFrameShiftInSamples
  SherpaOnnxOnlineSpeechDenoiserGetSampleRate
  SherpaOnnxOnlineSpeechDenoiserRun
  SherpaOnnxOnlineSpeechDenoiserFlush
  SherpaOnnxOnlineSpeechDenoiserReset
  # punctuation
  SherpaOnnxCreateOfflinePunctuation
  SherpaOnnxDestroyOfflinePunctuation
  SherpaOfflinePunctuationAddPunct
  SherpaOfflinePunctuationFreeText
  SherpaOnnxCreateOnlinePunctuation
  SherpaOnnxDestroyOnlinePunctuation
  SherpaOnnxOnlinePunctuationAddPunct
  SherpaOnnxOnlinePunctuationFreeText
  # version
  SherpaOnnxGetGitDate
  SherpaOnnxGetGitSha1
  SherpaOnnxGetVersionStr
  SherpaOnnxGetOnnxruntimeVersionStr
)

set(mangled_exported_functions)
foreach(x IN LISTS exported_functions)
  list(APPEND mangled_exported_functions "_${x}")
endforeach()
list(JOIN mangled_exported_functions "," all_exported_functions)

include_directories(${CMAKE_SOURCE_DIR})

# 锁定初始 512MB，最大 2048MB (2GB)，开启 SIMD128 向量化与 16MB 栈保护
set(MY_FLAGS " -s FORCE_FILESYSTEM=1 -s INITIAL_MEMORY=536870912 -s MAXIMUM_MEMORY=2147483648 -s ALLOW_MEMORY_GROWTH=1 -msimd128 -O3 ")
string(APPEND MY_FLAGS " -sSTACK_SIZE=16777216 ") # 16MB 栈
string(APPEND MY_FLAGS " -sALLOW_TABLE_GROWTH ")
string(APPEND MY_FLAGS " -sEXPORTED_FUNCTIONS=[_CopyHeap,_malloc,_free,${all_exported_functions}] ")
string(APPEND MY_FLAGS " -sEXPORTED_RUNTIME_METHODS=['ccall','stringToUTF8','setValue','getValue','lengthBytesUTF8','UTF8ToString','HEAPU8','HEAP16','HEAP32','HEAPU32','HEAPF32','HEAPF64','addFunction','removeFunction','FS'] ")
string(APPEND MY_FLAGS " -sMODULARIZE=1 ")
