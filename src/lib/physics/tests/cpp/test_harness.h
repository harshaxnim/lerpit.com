#pragma once

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace test_harness {

struct TestCase {
  const char* name;
  void (*fn)();
};

inline std::vector<TestCase>& registry() {
  static std::vector<TestCase> r;
  return r;
}

inline int& failureCount() {
  static int n = 0;
  return n;
}

struct Registrar {
  Registrar(const char* name, void (*fn)()) {
    registry().push_back({name, fn});
  }
};

inline void fail(const char* file, int line, const std::string& msg) {
  std::fprintf(stderr, "  FAIL %s:%d: %s\n", file, line, msg.c_str());
  failureCount()++;
}

template <typename A, typename B>
void check_eq(A a, B b, const char* aStr, const char* bStr, const char* file, int line) {
  if (!(a == b)) {
    fail(file, line, std::string(aStr) + " != " + bStr);
  }
}

inline void check_approx(float a, float b, float eps, const char* aStr, const char* bStr, const char* file, int line) {
  if (std::fabs(a - b) > eps) {
    fail(file, line, std::string(aStr) + " !~ " + bStr + " (|Δ| > " + std::to_string(eps) + ")");
  }
}

inline int runAll() {
  int passed = 0;
  for (const auto& t : registry()) {
    int before = failureCount();
    std::printf("RUN  %s\n", t.name);
    t.fn();
    if (failureCount() == before) {
      ++passed;
      std::printf("PASS %s\n", t.name);
    } else {
      std::printf("FAIL %s\n", t.name);
    }
  }
  std::printf("\n%d/%zu tests passed\n", passed, registry().size());
  return failureCount() == 0 ? 0 : 1;
}

}

#define TEST(name) \
  static void name(); \
  static ::test_harness::Registrar _reg_##name(#name, name); \
  static void name()

#define CHECK(cond) \
  do { if (!(cond)) ::test_harness::fail(__FILE__, __LINE__, "CHECK(" #cond ") failed"); } while (0)

#define CHECK_EQ(a, b) \
  ::test_harness::check_eq((a), (b), #a, #b, __FILE__, __LINE__)

#define CHECK_APPROX(a, b, eps) \
  ::test_harness::check_approx(static_cast<float>(a), static_cast<float>(b), static_cast<float>(eps), #a, #b, __FILE__, __LINE__)
