import subprocess
import os
import pandas as pd
import os
import ast

import seaborn as sns

global_path = '/data/xuanrenSong/CM_Power_Website'
file_path = os.path.join(global_path, 'data')

country_list = ['Australia', 'Brazil', 'Chile', 'China',
                'EU27&UK', 'France', 'Germany',
                'India', 'Italy', 'Japan', 'Mexico', 'New Zealand',
                'Russia', 'South Africa', 'Spain',
                'Turkey', 'United Kingdom', 'United States']


def main():
    # 先更新数据
    process_data()
    # Usage:
    git_push(global_path)


def process_data():
    df = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/global/Global_PM_corT.csv')

    df['date'] = pd.to_datetime(df['date'], format='%d/%m/%Y')
    df = pd.pivot_table(df, index=['country', 'date'], values='value', columns='sector').reset_index()
    df.columns = ['country', 'date', 'coal', 'gas', 'hydro', 'nuclear', 'oil', 'other', 'solar', 'wind']
    df['total'] = df.sum(axis=1, numeric_only=True)
    df['fossil'] = df[['coal', 'gas', 'oil']].sum(axis=1)
    df['renewables'] = df[['hydro', 'other', 'solar', 'wind']].sum(axis=1)

    df['country'] = df['country'].str.replace('EU27 & UK', 'EU27&UK')
    df['country'] = df['country'].replace('UK', 'United Kingdom')
    df['country'] = df['country'].str.replace('US', 'United States')
    df = df[df['country'].isin(country_list)].reset_index(drop=True)

    df['year'] = df['date'].dt.year
    df = df.set_index(['date', 'country', 'year']).stack().reset_index().rename(columns={'level_3': 'type', 0: 'value'})

    # 生成7日平滑数据
    df_7mean = df.copy()
    df_7mean['value'] = df_7mean.groupby(['country', 'type'])['value'].transform(
        lambda x: x.rolling(window=7, min_periods=1).mean())

    # 四舍五入到2位小数
    df_7mean['value'] = round(df_7mean['value'], 2)
    # 输出
    df.to_csv(os.path.join(file_path, 'data_for_download.csv'), index=False, encoding='utf_8_sig')
    df_7mean.to_csv(os.path.join(file_path, 'data_for_line_chart.csv'), index=False, encoding='utf_8_sig')

    # 再输出一版给stacked area用的
    df_7mean = df_7mean[~df_7mean['type'].isin(['fossil', 'renewables', 'total'])].reset_index(drop=True)
    df_7mean['total'] = df_7mean.groupby(['country', 'date'])['value'].transform('sum')
    df_7mean['percentage'] = (df_7mean['value'] / df_7mean['total']) * 100

    df_7mean.to_csv(os.path.join(file_path, 'data_for_stacked_area_chart.csv'), index=False, encoding='utf_8_sig')

    # 再计算一版散点图用的
    df = load_power_data(df)
    df_iea = load_iea_data()
    df_filtered = prepare_comparison_data(df, df_iea)

    df_filtered.to_csv(os.path.join(file_path, 'data_for_scatter_plot.csv'), index=False, encoding='utf_8_sig')


def load_power_data(df):
    df['date'] = pd.to_datetime(df['date'])
    df['month'] = df['date'].dt.month
    return df.drop(columns=['date']).groupby(['year', 'month', 'country', 'type']).sum().reset_index()


def load_iea_data():
    df_iea = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/#global_rf/iea/iea_cleaned.csv')
    country_replacements = {
        'Republic of Turkiye': 'Turkey',
        'Slovak Republic': 'Slovakia',
        "People's Republic of China": 'China'
    }
    df_iea['country'] = df_iea['country'].replace(country_replacements)

    with open(os.path.join(file_path, 'eu_countries.txt'), 'r') as file:
        eu_countries = ast.literal_eval(file.read())

    df_iea_eu = df_iea[df_iea['country'].isin(eu_countries)].reset_index(drop=True)
    df_iea_eu['country'] = 'EU27&UK'
    df_iea_eu = df_iea_eu.groupby(['country', 'year', 'month']).sum().reset_index()

    df_iea = pd.concat([df_iea, df_iea_eu]).reset_index(drop=True)

    df_iea['total'] = df_iea[['coal', 'gas', 'oil', 'nuclear', 'hydro', 'solar', 'wind', 'other']].sum(axis=1)
    df_iea['fossil'] = df_iea[['coal', 'gas', 'oil']].sum(axis=1)
    df_iea['renewables'] = df_iea[['nuclear', 'hydro', 'solar', 'wind', 'other']].sum(axis=1)

    return df_iea.melt(id_vars=['country', 'year', 'month'], var_name='type', value_name='iea')


def prepare_comparison_data(df, df_iea):
    df_compare = pd.merge(df, df_iea)
    df_compare['value'] = round(df_compare['value'] / 1000, 2)
    df_compare['iea'] = round(df_compare['iea'] / 1000, 2)
    return df_compare


def git_push(repo_path, commit_message="Automated commit"):
    try:
        os.chdir(repo_path)

        # Pull the latest changes from the remote repository
        subprocess.run(['git', 'pull'])

        subprocess.run(['git', 'add', '--all'])
        subprocess.run(['git', 'commit', '-m', commit_message])

        # Get the current branch name
        current_branch = subprocess.getoutput('git rev-parse --abbrev-ref HEAD')
        subprocess.run(['git', 'push', 'origin', current_branch])

        print("Changes pulled and pushed successfully.")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
