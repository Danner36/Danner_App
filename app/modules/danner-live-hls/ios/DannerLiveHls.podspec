Pod::Spec.new do |s|
  s.name           = 'DannerLiveHls'
  s.version        = '1.0.0'
  s.summary        = 'Captures the on-screen Guardians web player into a local HLS origin.'
  s.description    = 'Local Expo module used by Danner Apps to live-convert web playback for AirPlay and Cast.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Danner Apps'
  s.homepage       = 'https://github.com/Danner36/Danner_App'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/Danner36/Danner_App.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'AVKit', 'AudioToolbox', 'CoreMedia', 'Network', 'ReplayKit', 'UIKit', 'VideoToolbox'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
