import pandas as pd
import os

file_path = '/data/xuanrenSong/CM_Power_Website/data/data_description.csv'

df_data = pd.read_csv(file_path)
df_country = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/global/Global_Power_gwh.csv')
df_country['country'] = df_country['country'].replace('EU27 & UK', 'EU27&UK')
df_country['country'] = df_country['country'].replace('UK', 'United Kingdom')
df_country['country'] = df_country['country'].replace('US', 'United States')
df_country['total'] = df_country.sum(axis=1, numeric_only=True)

country_list = df_country['country'].unique()
df_all = []
for country in country_list:
    df_temp = pd.DataFrame()
    temp = df_country[(df_country['country'] == country) & (df_country['total'] != 0)]
    temp_min_date = min(temp['date'])
    df_temp['starting_date'] = [temp_min_date]
    df_temp['country'] = country
    df_all.append(df_temp)
df_final = pd.concat(df_all)

df_data = pd.merge(df_data, df_final, how='outer')
germany_values = df_data[df_data['country'] == 'Germany'].iloc[0]
# Loop over each column and fill NaN values with the corresponding value from the Germany row
for column in df_data.columns:
    df_data[column].fillna(germany_values[column], inplace=True)
df_data.drop(columns=['duration']).to_csv(file_path, index=False, encoding='utf_8_sig')
