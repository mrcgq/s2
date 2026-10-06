
// sherpa-onnx/csrc/dsp-radar.h
#ifndef SHERPA_ONNX_CSRC_DSP_RADAR_H_
#define SHERPA_ONNX_CSRC_DSP_RADAR_H_

#include <cmath>
#include <cstdint>
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>

namespace sherpa_onnx {

class BiquadFilter {
 public:
  BiquadFilter() = default;

  static BiquadFilter CreateHighPass(float sample_rate, float cutoff_hz = 80.0f, float q = 0.707f) {
    BiquadFilter f;
    float w0 = 2.0f * M_PI * cutoff_hz / sample_rate;
    float alpha = std::sin(w0) / (2.0f * q);
    float cos_w0 = std::cos(w0);

    float b0 = (1.0f + cos_w0) / 2.0f;
    float b1 = -(1.0f + cos_w0);
    float b2 = (1.0f + cos_w0) / 2.0f;
    float a0 = 1.0f + alpha;
    float a1 = -2.0f * cos_w0;
    float a2 = 1.0f - alpha;

    f.b0_ = b0 / a0; f.b1_ = b1 / a0; f.b2_ = b2 / a0;
    f.a1_ = a1 / a0; f.a2_ = a2 / a0;
    return f;
  }

  static BiquadFilter CreatePeakingEQ(float sample_rate, float center_hz = 3000.0f, float gain_db = 8.0f, float q = 1.2f) {
    BiquadFilter f;
    float w0 = 2.0f * M_PI * center_hz / sample_rate;
    float alpha = std::sin(w0) / (2.0f * q);
    float cos_w0 = std::cos(w0);
    float A = std::pow(10.0f, gain_db / 40.0f);

    float b0 = 1.0f + alpha * A;
    float b1 = -2.0f * cos_w0;
    float b2 = 1.0f - alpha * A;
    float a0 = 1.0f + alpha / A;
    float a1 = -2.0f * cos_w0;
    float a2 = 1.0f - alpha / A;

    f.b0_ = b0 / a0; f.b1_ = b1 / a0; f.b2_ = b2 / a0;
    f.a1_ = a1 / a0; f.a2_ = a2 / a0;
    return f;
  }

  inline float Process(float in) {
    float out = b0_ * in + b1_ * x1_ + b2_ * x2_ - a1_ * y1_ - a2_ * y2_;
    x2_ = x1_;
    x1_ = in;
    y2_ = y1_;
    y1_ = out;
    return out;
  }

 private:
  float b0_ = 1.0f, b1_ = 0.0f, b2_ = 0.0f;
  float a1_ = 0.0f, a2_ = 0.0f;
  float x1_ = 0.0f, x2_ = 0.0f, y1_ = 0.0f, y2_ = 0.0f;
};

inline float SoftCompandSample(float x) {
  if (std::abs(x) < 1e-6f) return x;
  float sign = (x > 0.0f) ? 1.0f : -1.0f;
  float mag = std::abs(x);
  float boosted = std::pow(mag, 0.72f) * 2.0f;
  if (boosted > 0.95f) {
    boosted = 0.95f + 0.05f * std::tanh((boosted - 0.95f) / 0.05f);
  }
  return sign * boosted;
}

inline void ApplyAcousticRadar(float *samples, int32_t n, int32_t sample_rate = 16000) {
  if (!samples || n <= 0) return;
  auto hpf = BiquadFilter::CreateHighPass(static_cast<float>(sample_rate), 80.0f, 0.707f);
  auto eq = BiquadFilter::CreatePeakingEQ(static_cast<float>(sample_rate), 3000.0f, 8.0f, 1.2f);
  for (int32_t i = 0; i < n; ++i) {
    float s = samples[i];
    s = hpf.Process(s);
    s = eq.Process(s);
    s = SoftCompandSample(s);
    samples[i] = s;
  }
}

inline std::vector<uint32_t> DecodeUtf8ToCodepoints(const std::string &str) {
  std::vector<uint32_t> out;
  size_t i = 0;
  while (i < str.size()) {
    uint8_t c = static_cast<uint8_t>(str[i]);
    uint32_t cp = 0;
    size_t len = 0;
    if (c < 0x80) { cp = c; len = 1; }
    else if ((c & 0xE0) == 0xC0) { cp = c & 0x1F; len = 2; }
    else if ((c & 0xF0) == 0xE0) { cp = c & 0x0F; len = 3; }
    else if ((c & 0xF8) == 0xF0) { cp = c & 0x07; len = 4; }
    else { ++i; continue; }

    if (i + len > str.size()) break;
    for (size_t j = 1; j < len; ++j) {
      cp = (cp << 6) | (static_cast<uint8_t>(str[i + j]) & 0x3F);
    }
    if (cp > 0x20 && cp != 0x3000 && cp != 0x3001 && cp != 0x3002) {
      out.push_back(cp);
    }
    i += len;
  }
  return out;
}

inline float CalcShannonEntropy(const std::vector<uint32_t> &cps) {
  if (cps.empty()) return 0.0f;
  std::unordered_map<uint32_t, int32_t> counts;
  for (uint32_t cp : cps) counts[cp]++;
  float total = static_cast<float>(cps.size());
  float ent = 0.0f;
  for (const auto &kv : counts) {
    float p = kv.second / total;
    ent -= p * std::log2(p);
  }
  return ent;
}

inline std::string ApplyEntropyAndLoopBreaker(const std::string &raw_text) {
  if (raw_text.empty()) return raw_text;
  auto cps = DecodeUtf8ToCodepoints(raw_text);
  if (cps.size() >= 8) {
    float entropy = CalcShannonEntropy(cps);
    std::unordered_set<uint32_t> uniq(cps.begin(), cps.end());
    float div_ratio = static_cast<float>(uniq.size()) / cps.size();

    if (entropy < 1.30f || div_ratio < 0.20f) {
      return "[Low-Entropy Hallucination Suppressed]";
    }

    for (size_t n = 1; n <= 4; ++n) {
      if (cps.size() < n * 3) continue;
      for (size_t i = 0; i + n * 3 <= cps.size(); ++i) {
        bool match = true;
        for (size_t k = 0; k < n; ++k) {
          if (cps[i + k] != cps[i + n + k] || cps[i + k] != cps[i + 2 * n + k]) {
            match = false;
            break;
          }
        }
        if (match) {
          return raw_text.substr(0, raw_text.size() / 2);
        }
      }
    }
  }
  return raw_text;
}

}  // namespace sherpa_onnx
#endif  // SHERPA_ONNX_CSRC_DSP_RADAR_H_
