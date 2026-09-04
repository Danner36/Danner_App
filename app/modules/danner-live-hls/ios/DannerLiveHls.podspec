Pod::Spec.new do |s|
  s.name           = 'DannerLiveHls'
  s.version        = '1.0.0'
  s.summary        = 'Relays an approved page HLS stream from a local origin.'
  s.description    = 'Local Expo module used by Danner Apps to relay approved web playback to Cast and AirPlay targets.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Danner Apps'
  s.homepage       = 'https://github.com/Danner36/Danner_App'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/Danner36/Danner_App.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Network'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_STRICT_CONCURRENCY' => 'minimal'
  }
end
