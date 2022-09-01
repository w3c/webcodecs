#include "emscripten.h"
#include "src/libavcodec/packet.h"
#include "src/libavcodec/avcodec.h"
#include "src/libavformat/avformat.h"
#include "src/libavformat/avio.h"
#include "src/libavutil/avutil.h"
#include "src/libavutil/mathematics.h"
#include "src/libavutil/rational.h"

#include <stdio.h>

EMSCRIPTEN_KEEPALIVE
void logAvError(int error_code) {
  char error_str[128];
  av_strerror(error_code, error_str, sizeof(error_str));
  printf("ffmpeg error str: %s\n", error_str);
}

static const int64_t kMicrosecondsPerSecond = 1000000;
static const AVRational kMicrosecondsTimeBase = (struct AVRational){ 1, kMicrosecondsPerSecond };

EMSCRIPTEN_KEEPALIVE
void nativePointerTest(int fp) {
  printf("NATIVE: about to call fp: %d\n", fp);
  void (*f)() = (void (*)())(fp);
  f();
  printf("NATIVE: fp returned\n");
}

EMSCRIPTEN_KEEPALIVE
AVRational MicrosecondsTimeBase() {
  return kMicrosecondsTimeBase;
}

EMSCRIPTEN_KEEPALIVE
int64_t CONST_AV_NOPTS_VALUE() {
  return AV_NOPTS_VALUE;
}

EMSCRIPTEN_KEEPALIVE
int CONST_AV_CODEC_ID_AAC() {
  return AV_CODEC_ID_AAC;
}

EMSCRIPTEN_KEEPALIVE
int CONST_AVFMT_FLAG_CUSTOM_IO() {
  return AVFMT_FLAG_CUSTOM_IO;
}

EMSCRIPTEN_KEEPALIVE
int CONST_AVFMT_FLAG_FAST_SEEK() {
  return AVFMT_FLAG_FAST_SEEK;
}

EMSCRIPTEN_KEEPALIVE
int CONST_AV_EF_EXPLODE() {
  return AV_EF_EXPLODE;
}

EMSCRIPTEN_KEEPALIVE
void  AVIOContext_seekable_s(AVIOContext* avio, int seekable) {
  avio->seekable = seekable;
}

EMSCRIPTEN_KEEPALIVE
void  AVIOContext_write_flag_s(AVIOContext* avio, int write_flag) {
  avio->write_flag = write_flag;
}

EMSCRIPTEN_KEEPALIVE
void AVFormatContext_flags_s(AVFormatContext* context, int flags) {
  context->flags = flags;
}

EMSCRIPTEN_KEEPALIVE
void AVFormatContext_error_recognition_s(AVFormatContext* context, int error_recognition) {
  context->error_recognition = error_recognition;
}

EMSCRIPTEN_KEEPALIVE
void AVFormatContext_pb_s(AVFormatContext* context, AVIOContext* avio) {
  context->pb = avio;
}

EMSCRIPTEN_KEEPALIVE
AVStream* AVFormatContext_streams_a(const AVFormatContext* context, int index) {
  return context->streams[index];
}

EMSCRIPTEN_KEEPALIVE
AVRational AVStream_time_base_a(const AVStream* stream) {
  return stream->time_base;
}

EMSCRIPTEN_KEEPALIVE
AVCodecParameters* AVStream_codecpar_a(const AVStream* stream) {
  return stream->codecpar;
}

EMSCRIPTEN_KEEPALIVE
int AVCodecParameters_codec_id_a(const AVCodecParameters* codecpar) {
  return codecpar->codec_id;
}

EMSCRIPTEN_KEEPALIVE
int AVCodecParameters_profile_a(const AVCodecParameters* codecpar) {
  return codecpar->profile;
}

EMSCRIPTEN_KEEPALIVE
int AVCodecParameters_channels_a(const AVCodecParameters* codecpar) {
  return codecpar->channels;
}

EMSCRIPTEN_KEEPALIVE
uint8_t* AVCodecParameters_extradata_a(const AVCodecParameters* codecpar) {
  return codecpar->extradata;
}

EMSCRIPTEN_KEEPALIVE
int AVCodecParameters_extradata_size_a(const AVCodecParameters* codecpar) {
  return codecpar->extradata_size;
}

EMSCRIPTEN_KEEPALIVE
int AVCodecParameters_sample_rate_a(const AVCodecParameters* codecpar) {
  return codecpar->sample_rate;
}

EMSCRIPTEN_KEEPALIVE
int64_t AVPacket_pts_a(const AVPacket* packet) {
  return packet->pts;
}

EMSCRIPTEN_KEEPALIVE
uint8_t* AVPacket_data_a(const AVPacket* packet) {
  return packet->data;
}

EMSCRIPTEN_KEEPALIVE
int AVPacket_size_a(const AVPacket* packet) {
  return packet->size;
}

EMSCRIPTEN_KEEPALIVE
int AVPacket_stream_index_a(const AVPacket* packet) {
  return packet->stream_index;
}